import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import {
  clearSessionCookie,
  createSession,
  hashPassword,
  hashToken,
  newToken,
  revokeSession,
  setSessionCookie,
  verifyPassword,
} from '../lib/auth.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/http-error.js';
import { parse } from '../lib/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { logAudit } from '../services/audit.js';

export const router = Router();

const emailSchema = z.string().trim().toLowerCase().email('ایمیل معتبر نیست.');

const passwordSchema = z
  .string()
  .min(8, 'رمز عبور باید حداقل ۸ کاراکتر باشد.')
  .max(200, 'رمز عبور بیش از حد طولانی است.');

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'رمز عبور را وارد کنید.'),
});

/** Shape returned to the client — never includes password hashes. */
export const publicUser = (row) => ({
  id: row.id,
  email: row.email,
  fullName: row.full_name,
  role: row.role,
  createdAt: row.created_at,
});

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = parse(registerSchema, req.body);

    const existing = await query('SELECT 1 FROM users WHERE email = $1', [data.email]);
    if (existing.rowCount) throw conflict('این ایمیل از قبل ثبت شده است.');

    const passwordHash = await hashPassword(data.password);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, full_name, role, created_at`,
      [data.email, passwordHash, data.fullName || null],
    );

    const user = rows[0];
    const { token } = await createSession(user, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    setSessionCookie(res, token);
    await logAudit({ userId: user.id, action: 'auth.register', entity: 'users', entityId: user.id, ip: req.ip });

    res.status(201).json({ user: publicUser(user) });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = parse(loginSchema, req.body);

    const { rows } = await query(
      `SELECT id, email, password_hash, full_name, role, is_blocked, blocked_reason
         FROM users WHERE email = $1`,
      [data.email],
    );
    const user = rows[0];
    // Constant-ish response time: always run a comparison.
    const ok = user ? await verifyPassword(data.password, user.password_hash) : false;
    if (!user || !ok) throw unauthorized('ایمیل یا رمز عبور نادرست است.');
    if (user.is_blocked) {
      throw unauthorized(
        user.blocked_reason
          ? `حساب شما مسدود شده است: ${user.blocked_reason}`
          : 'حساب شما مسدود شده است.',
      );
    }

    const { token } = await createSession(user, {
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    setSessionCookie(res, token);
    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    await logAudit({ userId: user.id, action: 'auth.login', entity: 'users', entityId: user.id, ip: req.ip });

    res.json({ user: publicUser(user) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    if (req.sessionJti) {
      await revokeSession(req.sessionJti);
      await logAudit({ userId: req.user?.id, action: 'auth.logout', ip: req.ip });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({ user: publicUser(req.user) });
  }),
);

/**
 * Requests a reset link. There is no mail provider configured, so in
 * non-production environments the token is returned directly and clearly
 * marked as a development aid.
 */
router.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = parse(z.object({ email: emailSchema }), req.body);
    const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);

    let devToken;
    if (rows[0]) {
      const token = newToken();
      devToken = token;
      await query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '30 minutes')`,
        [rows[0].id, hashToken(token)],
      );
    }

    // Always the same answer, so the endpoint cannot be used to enumerate users.
    res.json({
      ok: true,
      message: 'اگر این ایمیل در سایت ثبت شده باشد، لینک بازیابی ارسال می‌شود.',
      ...(config.env !== 'production' && devToken
        ? { devToken, devNotice: 'حالت توسعه: سرویس ایمیل پیکربندی نشده است.' }
        : {}),
    });
  }),
);

router.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const data = parse(
      z.object({ token: z.string().min(10, 'توکن نامعتبر است.'), password: passwordSchema }),
      req.body,
    );

    const { rows } = await query(
      `SELECT id, user_id FROM password_resets
        WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [hashToken(data.token)],
    );
    const reset = rows[0];
    if (!reset) throw badRequest('لینک بازیابی منقضی شده یا نامعتبر است.');

    const passwordHash = await hashPassword(data.password);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, reset.user_id]);
    await query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
    // Any stolen session must not survive a password reset.
    await query('DELETE FROM user_sessions WHERE user_id = $1', [reset.user_id]);
    await logAudit({ userId: reset.user_id, action: 'auth.password_reset', ip: req.ip });

    res.json({ ok: true, message: 'رمز عبور با موفقیت تغییر کرد. دوباره وارد شوید.' });
  }),
);

router.patch(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = parse(
      z.object({
        currentPassword: z.string().min(1, 'رمز عبور فعلی را وارد کنید.'),
        newPassword: passwordSchema,
      }),
      req.body,
    );

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) throw notFound('کاربر پیدا نشد.');
    if (!(await verifyPassword(data.currentPassword, rows[0].password_hash))) {
      throw badRequest('رمز عبور فعلی نادرست است.');
    }

    const passwordHash = await hashPassword(data.newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);
    // Keep the current device signed in, drop the rest.
    await query('DELETE FROM user_sessions WHERE user_id = $1 AND jti <> $2', [
      req.user.id,
      req.sessionJti,
    ]);
    await logAudit({ userId: req.user.id, action: 'auth.password_change', ip: req.ip });

    res.json({ ok: true, message: 'رمز عبور به‌روزرسانی شد.' });
  }),
);
