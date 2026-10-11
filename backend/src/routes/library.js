import { Router } from 'express';
import { z } from 'zod';

import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { notFound } from '../lib/http-error.js';
import { parse } from '../lib/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { CONTENT_CARD_COLUMNS, CONTENT_CARD_JOINS } from '../services/catalog.js';

export const router = Router();

/**
 * Everything in this router is scoped to the signed-in user, so `requireAuth`
 * is applied per route rather than with `router.use` — the router is mounted at
 * `/`, and a global guard would reject unrelated public requests too.
 */
const get = (path, handler) => router.get(path, requireAuth, asyncHandler(handler));
const post = (path, handler) => router.post(path, requireAuth, asyncHandler(handler));
const put = (path, handler) => router.put(path, requireAuth, asyncHandler(handler));
const patch = (path, handler) => router.patch(path, requireAuth, asyncHandler(handler));
const del = (path, handler) => router.delete(path, requireAuth, asyncHandler(handler));

// ------------------------------------------------------------------- profile

/** The only account field a user may change about themselves. */
patch('/users/me', async (req, res) => {
  const { fullName } = parse(
    z.object({ fullName: z.string().trim().max(120).nullable() }),
    req.body,
  );
  const { rows } = await query(
    `UPDATE users SET full_name = $1 WHERE id = $2
     RETURNING id, email, full_name, role, created_at`,
    [fullName || null, req.user.id],
  );
  res.json({
    user: {
      id: rows[0].id,
      email: rows[0].email,
      fullName: rows[0].full_name,
      role: rows[0].role,
      createdAt: rows[0].created_at,
    },
  });
});

// ------------------------------------------------------------------ favorites

get('/favorites', async (req, res) => {
  const { rows } = await query(
    `SELECT ${CONTENT_CARD_COLUMNS}, f.created_at AS favorited_at
       ${CONTENT_CARD_JOINS}
       JOIN favorites f ON f.content_id = c.id AND f.user_id = $1
      WHERE c.status = 'published'
      ORDER BY f.created_at DESC`,
    [req.user.id],
  );
  res.json({ items: rows });
});

post('/favorites', async (req, res) => {
  const { contentId } = parse(z.object({ contentId: z.coerce.number().int().positive() }), req.body);
  await query(
    `INSERT INTO favorites (user_id, content_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.user.id, contentId],
  );
  res.status(201).json({ ok: true, favorited: true });
});

del('/favorites/:contentId', async (req, res) => {
  const { rowCount } = await query('DELETE FROM favorites WHERE user_id = $1 AND content_id = $2', [
    req.user.id,
    Number(req.params.contentId),
  ]);
  if (!rowCount) throw notFound('این مورد در فهرست علاقه‌مندی‌های شما نیست.');
  res.json({ ok: true, favorited: false });
});

// --------------------------------------------------------------- watch progress

const progressSchema = z.object({
  contentId: z.coerce.number().int().positive(),
  episodeId: z.coerce.number().int().positive().nullable().optional(),
  position: z.coerce.number().int().min(0),
  duration: z.coerce.number().int().min(0).optional(),
  completed: z.boolean().optional(),
});

/** Upsert playback position. Called periodically and when the player unmounts. */
put('/watch-progress', async (req, res) => {
  const data = parse(progressSchema, req.body);
  const episodeId = data.episodeId ?? null;
  const completed =
    data.completed ?? (Boolean(data.duration) && data.position >= data.duration * 0.95);

  const { rows } = await query(
    `INSERT INTO watch_progress
       (user_id, content_id, episode_id, position_seconds, duration_seconds, completed)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, content_id, episode_id)
     DO UPDATE SET position_seconds = EXCLUDED.position_seconds,
                   duration_seconds = EXCLUDED.duration_seconds,
                   completed        = EXCLUDED.completed,
                   updated_at       = now()
     RETURNING position_seconds, duration_seconds, completed, updated_at`,
    [req.user.id, data.contentId, episodeId, data.position, data.duration ?? null, completed],
  );

  await query(
    `INSERT INTO watch_history (user_id, content_id, episode_id, seconds_watched)
     VALUES ($1, $2, $3, $4)`,
    [req.user.id, data.contentId, episodeId, Math.max(0, data.position)],
  );

  res.json({ progress: rows[0] });
});

get('/watch-progress/continue', async (req, res) => {
  const { rows } = await query(
    `SELECT ${CONTENT_CARD_COLUMNS},
            wp.position_seconds, wp.duration_seconds, wp.updated_at, wp.episode_id
       ${CONTENT_CARD_JOINS}
       JOIN watch_progress wp ON wp.content_id = c.id AND wp.user_id = $1
      WHERE wp.completed = false AND c.status = 'published'
      ORDER BY wp.updated_at DESC
      LIMIT 24`,
    [req.user.id],
  );
  res.json({ items: rows });
});

get('/watch-progress/:contentId', async (req, res) => {
  const { rows } = await query(
    `SELECT episode_id, position_seconds, duration_seconds, completed, updated_at
       FROM watch_progress
      WHERE user_id = $1 AND content_id = $2`,
    [req.user.id, Number(req.params.contentId)],
  );
  res.json({ items: rows });
});

del('/watch-progress/:contentId', async (req, res) => {
  await query('DELETE FROM watch_progress WHERE user_id = $1 AND content_id = $2', [
    req.user.id,
    Number(req.params.contentId),
  ]);
  res.json({ ok: true });
});

// --------------------------------------------------------------- watch history

get('/history', async (req, res) => {
  const { rows } = await query(
    `SELECT ${CONTENT_CARD_COLUMNS},
            max(wh.watched_at) AS last_watched_at,
            sum(wh.seconds_watched)::int AS seconds_watched
       ${CONTENT_CARD_JOINS}
       JOIN watch_history wh ON wh.content_id = c.id AND wh.user_id = $1
      WHERE c.status = 'published'
      GROUP BY c.id, co.name_fa
      ORDER BY last_watched_at DESC
      LIMIT 60`,
    [req.user.id],
  );
  res.json({ items: rows });
});

del('/history', async (req, res) => {
  await query('DELETE FROM watch_history WHERE user_id = $1', [req.user.id]);
  res.json({ ok: true });
});
