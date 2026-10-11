import { Router } from 'express';
import { z } from 'zod';

import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { notFound } from '../lib/http-error.js';
import { parse } from '../lib/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { getSettings } from '../services/settings.js';

export const router = Router();

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'امتیاز بین ۱ تا ۱۰ باشد.').max(10, 'امتیاز بین ۱ تا ۱۰ باشد.'),
  comment: z.string().trim().max(2000, 'متن نظر بیش از حد طولانی است.').optional(),
});

const ensureEnabled = async () => {
  const settings = await getSettings();
  if (!settings.reviewsEnabled) {
    throw notFound('بخش نظرات در حال حاضر غیرفعال است.');
  }
};

/** Publishes a rating + optional comment. One review per user per title. */
router.post(
  '/reviews/:contentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureEnabled();
    const contentId = Number(req.params.contentId);
    const data = parse(reviewSchema, req.body);

    const { rowCount } = await query('SELECT 1 FROM content WHERE id = $1', [contentId]);
    if (!rowCount) throw notFound('محتوا پیدا نشد.');

    const { rows } = await query(
      `INSERT INTO reviews (user_id, content_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, content_id)
       DO UPDATE SET rating = EXCLUDED.rating,
                     comment = EXCLUDED.comment,
                     updated_at = now()
       RETURNING id, rating, comment, created_at, updated_at`,
      [req.user.id, contentId, data.rating, data.comment || null],
    );

    res.status(201).json({ review: rows[0] });
  }),
);

router.delete(
  '/reviews/:contentId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rowCount } = await query(
      'DELETE FROM reviews WHERE user_id = $1 AND content_id = $2',
      [req.user.id, Number(req.params.contentId)],
    );
    if (!rowCount) throw notFound('نظری برای حذف پیدا نشد.');
    res.json({ ok: true });
  }),
);
