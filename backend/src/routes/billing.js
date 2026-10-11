import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config.js';
import { query, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { badRequest, conflict, notFound } from '../lib/http-error.js';
import { parse } from '../lib/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { getActiveSubscription } from '../services/access.js';
import { logAudit } from '../services/audit.js';

export const router = Router();

/**
 * Payment gateway abstraction. Only the `sandbox` implementation exists today;
 * a real Iranian gateway (Zarinpal, IDPay, …) plugs in here by implementing the
 * same two functions. Nothing in the API layer needs to change.
 */
const gateways = {
  sandbox: {
    id: 'sandbox',
    isSandbox: true,
    async createPayment({ amountToman, description }) {
      return {
        authority: `sandbox-${crypto.randomUUID()}`,
        redirectUrl: null,
        amountToman,
        description,
      };
    },
    async verifyPayment({ authority }) {
      return { ok: Boolean(authority), reference: authority };
    },
  },
};

const gateway = gateways[config.paymentProvider] ?? gateways.sandbox;

const serializePlan = (row) => ({
  id: row.id,
  code: row.code,
  name: row.name_fa,
  description: row.description,
  priceToman: row.price_toman,
  durationDays: row.duration_days,
  features: row.features,
});

// ------------------------------------------------------------------- plans ---

router.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT * FROM subscription_plans WHERE is_active = true ORDER BY sort_order, price_toman`,
    );
    res.json({
      items: rows.map(serializePlan),
      gateway: { provider: gateway.id, sandbox: gateway.isSandbox },
    });
  }),
);

// ------------------------------------------------------------ my subscription

router.get(
  '/subscriptions/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const active = await getActiveSubscription(req.user.id);
    const { rows: history } = await query(
      `SELECT us.id, us.status, us.starts_at, us.ends_at, p.name_fa AS plan_name, p.code AS plan_code
         FROM user_subscriptions us
         JOIN subscription_plans p ON p.id = us.plan_id
        WHERE us.user_id = $1
        ORDER BY us.created_at DESC`,
      [req.user.id],
    );

    res.json({
      active: active
        ? {
            id: active.id,
            planCode: active.code,
            planName: active.name_fa,
            startsAt: active.starts_at,
            endsAt: active.ends_at,
          }
        : null,
      history: history.map((row) => ({
        id: row.id,
        status: row.status,
        planName: row.plan_name,
        planCode: row.plan_code,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      })),
    });
  }),
);

// ---------------------------------------------------------------- checkout ---

/** Starts a purchase: records a pending payment and returns where to go next. */
router.post(
  '/subscriptions/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { planId } = parse(z.object({ planId: z.coerce.number().int().positive() }), req.body);

    const { rows } = await query(
      'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true',
      [planId],
    );
    const plan = rows[0];
    if (!plan) throw notFound('این پلن اشتراک فعال نیست.');

    const payment = await gateway.createPayment({
      amountToman: plan.price_toman,
      description: `خرید ${plan.name_fa}`,
    });

    const { rows: inserted } = await query(
      `INSERT INTO payments (user_id, plan_id, amount_toman, status, provider, authority)
       VALUES ($1, $2, $3, 'pending', $4, $5)
       RETURNING id, authority, amount_toman, status, provider, created_at`,
      [req.user.id, plan.id, plan.price_toman, gateway.id, payment.authority],
    );

    await logAudit({
      userId: req.user.id,
      action: 'payment.initiated',
      entity: 'payments',
      entityId: inserted[0].id,
      meta: { planId: plan.id, amountToman: plan.price_toman, provider: gateway.id },
      ip: req.ip,
    });

    res.status(201).json({
      payment: {
        id: inserted[0].id,
        authority: inserted[0].authority,
        amountToman: inserted[0].amount_toman,
        status: inserted[0].status,
        provider: inserted[0].provider,
      },
      plan: serializePlan(plan),
      gateway: {
        provider: gateway.id,
        sandbox: gateway.isSandbox,
        // No real gateway is configured, so the client is told explicitly that
        // this is a simulation rather than a completed purchase.
        notice: gateway.isSandbox
          ? 'درگاه پرداخت واقعی پیکربندی نشده است؛ این پرداخت آزمایشی است و مبلغی از حساب شما کسر نمی‌شود.'
          : null,
      },
      callbackUrl: `/checkout/result?authority=${inserted[0].authority}`,
    });
  }),
);

/**
 * Gateway callback. In sandbox mode this is invoked from the checkout result
 * page; a real gateway would redirect here with its own verification payload.
 */
router.post(
  '/payments/:authority/verify',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { authority } = parse(z.object({ authority: z.string().min(6) }), req.params);

    const { rows } = await query('SELECT * FROM payments WHERE authority = $1', [authority]);
    const payment = rows[0];
    if (!payment || payment.user_id !== req.user.id) throw notFound('این پرداخت پیدا نشد.');
    if (payment.status === 'paid') throw conflict('این پرداخت قبلاً تأیید شده است.');
    if (payment.status !== 'pending') throw badRequest('این پرداخت قابل تأیید نیست.');

    if (gateway.isSandbox && !config.paymentSandboxEnabled) {
      throw badRequest('حالت آزمایشی پرداخت غیرفعال است.');
    }

    const verification = await gateway.verifyPayment({ authority });
    if (!verification.ok) {
      await query(`UPDATE payments SET status = 'failed' WHERE id = $1`, [payment.id]);
      throw badRequest('تأیید پرداخت ناموفق بود.');
    }

    const subscription = await withTransaction(async (client) => {
      const { rows: planRows } = await client.query(
        'SELECT * FROM subscription_plans WHERE id = $1',
        [payment.plan_id],
      );
      const plan = planRows[0];
      if (!plan) throw notFound('پلن این پرداخت پیدا نشد.');

      // Extend an existing active subscription instead of stacking a new one.
      const { rows: currentRows } = await client.query(
        `SELECT * FROM user_subscriptions
          WHERE user_id = $1 AND status = 'active' AND ends_at > now()
          ORDER BY ends_at DESC LIMIT 1`,
        [payment.user_id],
      );
      const current = currentRows[0];

      const { rows: subscriptionRows } = current
        ? await client.query(
            `UPDATE user_subscriptions
                SET ends_at = ends_at + ($2 || ' days')::interval, status = 'active'
              WHERE id = $1
              RETURNING id, starts_at, ends_at`,
            [current.id, plan.duration_days],
          )
        : await client.query(
            `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at)
             VALUES ($1, $2, 'active', now(), now() + ($3 || ' days')::interval)
             RETURNING id, starts_at, ends_at`,
            [payment.user_id, plan.id, plan.duration_days],
          );

      await client.query(
        `UPDATE payments
            SET status = 'paid', paid_at = now(), provider_ref = $2, subscription_id = $3
          WHERE id = $1`,
        [payment.id, verification.reference, subscriptionRows[0].id],
      );

      return subscriptionRows[0];
    });

    await logAudit({
      userId: req.user.id,
      action: 'payment.verified',
      entity: 'payments',
      entityId: payment.id,
      meta: { sandbox: gateway.isSandbox, amountToman: payment.amount_toman },
      ip: req.ip,
    });

    res.json({
      ok: true,
      sandbox: gateway.isSandbox,
      subscription: {
        id: subscription.id,
        startsAt: subscription.starts_at,
        endsAt: subscription.ends_at,
      },
    });
  }),
);

router.post(
  '/subscriptions/cancel',
  requireAuth,
  asyncHandler(async (req, res) => {
    const active = await getActiveSubscription(req.user.id);
    if (!active) throw notFound('اشتراک فعالی برای لغو وجود ندارد.');

    await query(
      `UPDATE user_subscriptions SET status = 'canceled', canceled_at = now() WHERE id = $1`,
      [active.id],
    );
    await logAudit({
      userId: req.user.id,
      action: 'subscription.canceled',
      entity: 'user_subscriptions',
      entityId: active.id,
      ip: req.ip,
    });

    res.json({ ok: true, message: 'اشتراک شما لغو شد و تا پایان دوره فعال می‌ماند.' });
  }),
);

// ------------------------------------------------------------------ payments

router.get(
  '/payments/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT p.id, p.amount_toman, p.status, p.provider, p.authority,
              p.created_at, p.paid_at, sp.name_fa AS plan_name
         FROM payments p
         LEFT JOIN subscription_plans sp ON sp.id = p.plan_id
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC
        LIMIT 50`,
      [req.user.id],
    );
    res.json({
      items: rows.map((row) => ({
        id: row.id,
        amountToman: row.amount_toman,
        status: row.status,
        provider: row.provider,
        authority: row.authority,
        planName: row.plan_name,
        createdAt: row.created_at,
        paidAt: row.paid_at,
      })),
    });
  }),
);
