import { Router } from 'express';
import { z } from 'zod';

import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { notFound } from '../lib/http-error.js';
import { parse } from '../lib/validate.js';
import { assertCanWatch } from '../services/access.js';

export const router = Router();

/**
 * Returns the playable manifest for a title (or a specific episode).
 * Access is decided here, on the server — the client never receives a stream
 * URL for content it may not watch.
 */
router.get(
  '/playback/:contentId',
  asyncHandler(async (req, res) => {
    const contentId = Number(req.params.contentId);
    const episodeId = req.query.episodeId ? Number(req.query.episodeId) : null;

    const { rows: contentRows } = await query(
      `SELECT id, kind, slug, title_fa, title_en, access, status, backdrop_url, poster_url
         FROM content WHERE id = $1`,
      [contentId],
    );
    const content = contentRows[0];
    if (!content) throw notFound('محتوا پیدا نشد.');

    await assertCanWatch(req.user, content);

    // Episode-level sources win; a series without per-episode files falls back to
    // the streams registered on the series itself.
    let { rows: sources } = episodeId
      ? await query(
          `SELECT * FROM video_sources WHERE episode_id = $1 ORDER BY is_default DESC, quality DESC`,
          [episodeId],
        )
      : { rows: [] };

    if (!sources.length) {
      ({ rows: sources } = await query(
        `SELECT * FROM video_sources WHERE content_id = $1 ORDER BY is_default DESC, quality DESC`,
        [contentId],
      ));
    }

    let episode = null;
    if (episodeId) {
      const { rows } = await query(
        `SELECT e.id, e.episode_number, e.title_fa, e.title_en, e.runtime_minutes,
                s.season_number
           FROM episodes e JOIN seasons s ON s.id = e.season_id
          WHERE e.id = $1`,
        [episodeId],
      );
      episode = rows[0] ?? null;
    }

    const sourceIds = sources.map((source) => source.id);
    const [subs, tracks] = await Promise.all([
      sourceIds.length
        ? query('SELECT * FROM subtitles WHERE video_source_id = ANY($1::bigint[])', [sourceIds])
        : Promise.resolve({ rows: [] }),
      sourceIds.length
        ? query('SELECT * FROM audio_tracks WHERE video_source_id = ANY($1::bigint[])', [sourceIds])
        : Promise.resolve({ rows: [] }),
    ]);

    res.json({
      content,
      episode,
      // Explicitly tells the UI when no stream is configured, instead of
      // rendering a player that silently fails.
      hasSource: sources.length > 0,
      sources: sources.map((source) => ({
        id: source.id,
        label: source.label,
        quality: source.quality,
        kind: source.source_kind,
        url: source.url,
        isDefault: source.is_default,
      })),
      subtitles: subs.rows.map((row) => ({
        id: row.id,
        languageCode: row.language_code,
        label: row.label,
        url: row.url,
        videoSourceId: row.video_source_id,
        isDefault: row.is_default,
      })),
      audioTracks: tracks.rows.map((row) => ({
        id: row.id,
        languageCode: row.language_code,
        label: row.label,
        videoSourceId: row.video_source_id,
        isDefault: row.is_default,
      })),
    });
  }),
);

/** Persists playback position for a signed-in user; anonymous users are ignored. */
router.post(
  '/playback/progress',
  asyncHandler(async (req, res) => {
    if (!req.user) return res.status(204).end();
    const data = parse(
      z.object({
        contentId: z.coerce.number().int().positive(),
        episodeId: z.coerce.number().int().positive().nullable().optional(),
        position: z.coerce.number().min(0),
        duration: z.coerce.number().min(0).optional(),
      }),
      req.body,
    );

    const completed = Boolean(data.duration) && data.position >= data.duration * 0.95;
    await query(
      `INSERT INTO watch_progress
         (user_id, content_id, episode_id, position_seconds, duration_seconds, completed)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, content_id, episode_id)
       DO UPDATE SET position_seconds = EXCLUDED.position_seconds,
                     duration_seconds = EXCLUDED.duration_seconds,
                     completed        = EXCLUDED.completed,
                     updated_at       = now()`,
      [
        req.user.id,
        data.contentId,
        data.episodeId ?? null,
        Math.round(data.position),
        data.duration ? Math.round(data.duration) : null,
        completed,
      ],
    );
    await query(
      `INSERT INTO watch_history (user_id, content_id, episode_id, seconds_watched)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, data.contentId, data.episodeId ?? null, Math.round(data.position)],
    );

    res.status(204).end();
  }),
);
