import { Router } from 'express';
import { z } from 'zod';

import { query, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { paginated, parsePagination } from '../lib/pagination.js';
import { parse } from '../lib/validate.js';
import { requireAdmin, requireStrictAdmin } from '../middleware/authenticate.js';
import { logAudit } from '../services/audit.js';
import { getSettings, updateSettings } from '../services/settings.js';

export const router = Router();

// Every admin route is gated on the server. The UI hiding a link is not access control.
router.use(requireAdmin);

/**
 * Whitelisted column maps. Column names come from these maps only; values are
 * always passed as query parameters, so no user input reaches the SQL text.
 */
const CONTENT_FIELDS = {
  kind: 'kind',
  slug: 'slug',
  titleFa: 'title_fa',
  titleEn: 'title_en',
  synopsisShort: 'synopsis_short',
  synopsisFull: 'synopsis_full',
  releaseYear: 'release_year',
  endYear: 'end_year',
  runtimeMinutes: 'runtime_minutes',
  ageRating: 'age_rating',
  ratingSource: 'rating_source',
  ratingValue: 'rating_value',
  ratingVotes: 'rating_votes',
  quality: 'quality',
  originalLanguage: 'original_language',
  posterUrl: 'poster_url',
  backdropUrl: 'backdrop_url',
  trailerUrl: 'trailer_url',
  hasAwards: 'has_awards',
  isFeatured: 'is_featured',
  featuredRank: 'featured_rank',
  status: 'status',
  access: 'access',
  releasedAt: 'released_at',
};

const BANNER_FIELDS = {
  titleFa: 'title_fa',
  subtitle: 'subtitle',
  imageUrl: 'image_url',
  linkUrl: 'link_url',
  placement: 'placement',
  isActive: 'is_active',
  sortOrder: 'sort_order',
};

const SECTION_FIELDS = {
  titleFa: 'title_fa',
  subtitle: 'subtitle',
  layout: 'layout',
  sourceType: 'source_type',
  sourceValue: 'source_value',
  maxItems: 'max_items',
  isActive: 'is_active',
  sortOrder: 'sort_order',
};

/** Builds `SET a = $1, b = $2` from a payload using a whitelisted column map. */
function buildAssignments(fieldMap, payload) {
  const columns = [];
  const values = [];
  for (const [key, column] of Object.entries(fieldMap)) {
    if (payload[key] === undefined) continue;
    values.push(payload[key]);
    columns.push(`${column} = $${values.length}`);
  }
  return { columns, values };
}

const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

// ------------------------------------------------------------------ dashboard

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const [users, content, subscriptions, revenue, topContent, recentPayments, errors] =
      await Promise.all([
        query(`SELECT
                 count(*)::int AS total,
                 count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last_30_days,
                 count(*) FILTER (WHERE is_blocked)::int AS blocked
               FROM users`),
        query(`SELECT
                 count(*) FILTER (WHERE kind = 'movie')::int AS movies,
                 count(*) FILTER (WHERE kind = 'series')::int AS series,
                 count(*) FILTER (WHERE status = 'draft')::int AS drafts,
                 count(*) FILTER (WHERE access = 'free')::int AS free_titles
               FROM content`),
        query(`SELECT
                 count(*) FILTER (WHERE status = 'active' AND ends_at > now())::int AS active,
                 count(*) FILTER (WHERE status = 'canceled')::int AS canceled
               FROM user_subscriptions`),
        query(`SELECT
                 COALESCE(sum(amount_toman) FILTER (WHERE status = 'paid'), 0)::bigint AS total_toman,
                 COALESCE(sum(amount_toman) FILTER (
                   WHERE status = 'paid' AND paid_at > now() - interval '30 days'), 0)::bigint AS last_30_days_toman
               FROM payments`),
        query(`SELECT c.id, c.title_fa, c.title_en, c.kind, c.poster_url,
                      count(wh.id)::int AS views
                 FROM content c
                 LEFT JOIN watch_history wh ON wh.content_id = c.id
                GROUP BY c.id
                ORDER BY views DESC, c.rating_votes DESC NULLS LAST
                LIMIT 8`),
        query(`SELECT p.id, p.amount_toman, p.status, p.created_at, p.provider,
                      sp.name_fa AS plan_name, u.email
                 FROM payments p
                 LEFT JOIN subscription_plans sp ON sp.id = p.plan_id
                 LEFT JOIN users u ON u.id = p.user_id
                ORDER BY p.created_at DESC LIMIT 8`),
        query(`SELECT count(*)::int AS total FROM audit_logs WHERE action LIKE 'error%'`),
      ]);

    const views = await query('SELECT count(*)::int AS total FROM watch_history');

    res.json({
      users: users.rows[0],
      content: content.rows[0],
      subscriptions: subscriptions.rows[0],
      payments: { ...revenue.rows[0], errors: errors.rows[0].total },
      views: views.rows[0].total,
      topContent: topContent.rows,
      recentPayments: recentPayments.rows,
    });
  }),
);

// -------------------------------------------------------------------- content

router.get(
  '/content',
  asyncHandler(async (req, res) => {
    const params = parse(
      z.object({
        q: z.string().trim().max(120).optional().default(''),
        kind: z.enum(['movie', 'series']).optional(),
        status: z.enum(['draft', 'published']).optional(),
        access: z.enum(['free', 'premium']).optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(60).optional(),
      }),
      req.query,
    );

    const { page, pageSize, offset } = parsePagination(params, { defaultSize: 20 });
    const where = ['1 = 1'];
    const values = [];
    const push = (value) => {
      values.push(value);
      return `$${values.length}`;
    };

    if (params.q) {
      const like = push(`%${params.q.replace(/\u200c/g, '')}%`);
      where.push(
        `(regexp_replace(c.title_fa, chr(8204), '', 'g') ILIKE ${like} OR lower(c.title_en) ILIKE ${like})`,
      );
    }
    if (params.kind) where.push(`c.kind = ${push(params.kind)}`);
    if (params.status) where.push(`c.status = ${push(params.status)}`);
    if (params.access) where.push(`c.access = ${push(params.access)}`);

    const clause = where.join(' AND ');
    const { rows } = await query(
      `SELECT c.id, c.kind, c.slug, c.title_fa, c.title_en, c.release_year, c.status, c.access,
              c.poster_url, c.rating_value, c.quality, c.created_at,
              (SELECT count(*) FROM seasons s WHERE s.content_id = c.id)::int AS season_count
         FROM content c
        WHERE ${clause}
        ORDER BY c.created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );

    const { rows: countRows } = await query(
      `SELECT count(*)::int AS total FROM content c WHERE ${clause}`,
      values,
    );

    res.json(paginated(rows, countRows[0].total, { page, pageSize }));
  }),
);

router.get(
  '/content/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT c.*,
              (SELECT json_agg(cg.genre_id) FROM content_genres cg WHERE cg.content_id = c.id) AS genre_ids
         FROM content c WHERE c.id = $1`,
      [Number(req.params.id)],
    );
    if (!rows[0]) throw notFound('محتوا پیدا نشد.');

    const [seasons, sources] = await Promise.all([
      query(
        `SELECT s.*, COALESCE((
           SELECT json_agg(e ORDER BY e.episode_number) FROM episodes e WHERE e.season_id = s.id
         ), '[]'::json) AS episodes
           FROM seasons s WHERE s.content_id = $1 ORDER BY s.season_number`,
        [rows[0].id],
      ),
      query('SELECT * FROM video_sources WHERE content_id = $1 ORDER BY is_default DESC', [
        rows[0].id,
      ]),
    ]);

    res.json({ content: rows[0], seasons: seasons.rows, sources: sources.rows });
  }),
);

/** Creates or updates a title, including its genre links, in one transaction. */
async function saveContent(payload, existingId = null) {
  const genreIds = Array.isArray(payload.genreIds) ? payload.genreIds.map(Number) : null;

  return withTransaction(async (client) => {
    let countryId = null;
    if (payload.countryCode) {
      const { rows } = await client.query('SELECT id FROM countries WHERE code = $1', [
        payload.countryCode,
      ]);
      countryId = rows[0]?.id ?? null;
    }

    let contentId = existingId;
    if (existingId) {
      const { columns, values } = buildAssignments(CONTENT_FIELDS, payload);
      if (countryId !== null) {
        values.push(countryId);
        columns.push(`country_id = $${values.length}`);
      }
      if (!columns.length) throw badRequest('هیچ فیلدی برای به‌روزرسانی ارسال نشده است.');
      values.push(existingId);
      await client.query(
        `UPDATE content SET ${columns.join(', ')} WHERE id = $${values.length}`,
        values,
      );
    } else {
      const slug = payload.slug || slugify(payload.titleEn || payload.titleFa);
      if (!slug) throw badRequest('برای محتوا یک اسلاگ یا عنوان انگلیسی لازم است.');
      const { rows } = await client.query(
        `INSERT INTO content
           (kind, slug, title_fa, title_en, synopsis_short, synopsis_full, release_year,
            runtime_minutes, age_rating, rating_value, rating_votes, rating_source, quality,
            country_id, original_language, poster_url, backdrop_url, trailer_url,
            has_awards, status, access, released_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING id`,
        [
          payload.kind ?? 'movie',
          slug,
          payload.titleFa,
          payload.titleEn,
          payload.synopsisShort ?? null,
          payload.synopsisFull ?? null,
          payload.releaseYear ?? null,
          payload.runtimeMinutes ?? null,
          payload.ageRating ?? null,
          payload.ratingValue ?? null,
          payload.ratingVotes ?? null,
          payload.ratingSource ?? null,
          payload.quality ?? null,
          countryId,
          payload.originalLanguage ?? null,
          payload.posterUrl ?? null,
          payload.backdropUrl ?? null,
          payload.trailerUrl ?? null,
          payload.hasAwards ?? false,
          payload.status ?? 'draft',
          payload.access ?? 'premium',
          payload.releasedAt ?? null,
        ],
      );
      contentId = rows[0].id;
    }

    if (genreIds) {
      await client.query('DELETE FROM content_genres WHERE content_id = $1', [contentId]);
      for (const genreId of genreIds.filter(Number.isFinite)) {
        await client.query(
          `INSERT INTO content_genres (content_id, genre_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [contentId, genreId],
        );
      }
    }

    return contentId;
  });
}

const contentPayloadSchema = z.object({
  kind: z.enum(['movie', 'series']).optional(),
  slug: z.string().trim().max(80).optional(),
  titleFa: z.string().trim().min(1, 'عنوان فارسی الزامی است.').max(200).optional(),
  titleEn: z.string().trim().min(1, 'عنوان انگلیسی الزامی است.').max(200).optional(),
  synopsisShort: z.string().trim().max(600).nullable().optional(),
  synopsisFull: z.string().trim().max(8000).nullable().optional(),
  releaseYear: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  endYear: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  runtimeMinutes: z.coerce.number().int().min(1).max(1000).nullable().optional(),
  ageRating: z.string().trim().max(20).nullable().optional(),
  ratingSource: z.string().trim().max(40).nullable().optional(),
  ratingValue: z.coerce.number().min(0).max(10).nullable().optional(),
  ratingVotes: z.coerce.number().int().min(0).nullable().optional(),
  quality: z.string().trim().max(20).nullable().optional(),
  countryCode: z.string().trim().length(2).nullable().optional(),
  originalLanguage: z.string().trim().max(40).nullable().optional(),
  posterUrl: z.string().trim().max(500).nullable().optional(),
  backdropUrl: z.string().trim().max(500).nullable().optional(),
  trailerUrl: z.string().trim().max(500).nullable().optional(),
  hasAwards: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  featuredRank: z.coerce.number().int().nullable().optional(),
  status: z.enum(['draft', 'published']).optional(),
  access: z.enum(['free', 'premium']).optional(),
  releasedAt: z.string().trim().max(20).nullable().optional(),
  genreIds: z.array(z.coerce.number().int().positive()).optional(),
});

router.post(
  '/content',
  asyncHandler(async (req, res) => {
    const payload = parse(contentPayloadSchema, req.body);
    if (!payload.titleFa || !payload.titleEn) {
      throw badRequest('عنوان فارسی و انگلیسی هر دو الزامی هستند.');
    }
    const id = await saveContent(payload);
    await logAudit({ userId: req.user.id, action: 'content.create', entity: 'content', entityId: id, ip: req.ip });
    res.status(201).json({ id });
  }),
);

router.patch(
  '/content/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const payload = parse(contentPayloadSchema, req.body);
    await saveContent(payload, id);
    await logAudit({ userId: req.user.id, action: 'content.update', entity: 'content', entityId: id, ip: req.ip });
    res.json({ ok: true, id });
  }),
);

router.delete(
  '/content/:id',
  requireStrictAdmin,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { rowCount } = await query('DELETE FROM content WHERE id = $1', [id]);
    if (!rowCount) throw notFound('محتوا پیدا نشد.');
    await logAudit({ userId: req.user.id, action: 'content.delete', entity: 'content', entityId: id, ip: req.ip });
    res.json({ ok: true });
  }),
);

// --------------------------------------------------------- seasons / episodes

router.post(
  '/content/:id/seasons',
  asyncHandler(async (req, res) => {
    const contentId = Number(req.params.id);
    const payload = parse(
      z.object({
        seasonNumber: z.coerce.number().int().min(0),
        titleFa: z.string().trim().max(200).optional(),
        synopsis: z.string().trim().max(4000).optional(),
        airYear: z.coerce.number().int().min(1900).max(2100).optional(),
        posterUrl: z.string().trim().max(500).optional(),
      }),
      req.body,
    );

    const { rows } = await query(
      `INSERT INTO seasons (content_id, season_number, title_fa, synopsis, air_year, poster_url)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (content_id, season_number)
       DO UPDATE SET title_fa = EXCLUDED.title_fa, synopsis = EXCLUDED.synopsis,
                     air_year = EXCLUDED.air_year, poster_url = EXCLUDED.poster_url
       RETURNING *`,
      [contentId, payload.seasonNumber, payload.titleFa ?? null, payload.synopsis ?? null,
        payload.airYear ?? null, payload.posterUrl ?? null],
    );
    await logAudit({ userId: req.user.id, action: 'season.upsert', entity: 'seasons', entityId: rows[0].id, ip: req.ip });
    res.status(201).json({ season: rows[0] });
  }),
);

router.delete(
  '/seasons/:id',
  requireStrictAdmin,
  asyncHandler(async (req, res) => {
    await query('DELETE FROM seasons WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  }),
);

router.post(
  '/seasons/:id/episodes',
  asyncHandler(async (req, res) => {
    const seasonId = Number(req.params.id);
    const payload = parse(
      z.object({
        episodeNumber: z.coerce.number().int().min(1),
        titleFa: z.string().trim().min(1, 'عنوان قسمت الزامی است.').max(200),
        titleEn: z.string().trim().max(200).optional(),
        synopsis: z.string().trim().max(4000).optional(),
        runtimeMinutes: z.coerce.number().int().min(1).max(1000).optional(),
        airDate: z.string().trim().max(20).optional(),
        stillUrl: z.string().trim().max(500).optional(),
      }),
      req.body,
    );

    const { rows } = await query(
      `INSERT INTO episodes
         (season_id, episode_number, title_fa, title_en, synopsis, runtime_minutes, air_date, still_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (season_id, episode_number)
       DO UPDATE SET title_fa = EXCLUDED.title_fa, title_en = EXCLUDED.title_en,
                     synopsis = EXCLUDED.synopsis, runtime_minutes = EXCLUDED.runtime_minutes,
                     air_date = EXCLUDED.air_date, still_url = EXCLUDED.still_url
       RETURNING *`,
      [seasonId, payload.episodeNumber, payload.titleFa, payload.titleEn ?? null,
        payload.synopsis ?? null, payload.runtimeMinutes ?? null, payload.airDate ?? null,
        payload.stillUrl ?? null],
    );
    await query(
      `UPDATE seasons SET episode_count =
         (SELECT count(*) FROM episodes WHERE season_id = $1) WHERE id = $1`,
      [seasonId],
    );
    await logAudit({ userId: req.user.id, action: 'episode.upsert', entity: 'episodes', entityId: rows[0].id, ip: req.ip });
    res.status(201).json({ episode: rows[0] });
  }),
);

router.delete(
  '/episodes/:id',
  requireStrictAdmin,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT season_id FROM episodes WHERE id = $1', [
      Number(req.params.id),
    ]);
    await query('DELETE FROM episodes WHERE id = $1', [Number(req.params.id)]);
    if (rows[0]) {
      await query(
        `UPDATE seasons SET episode_count =
           (SELECT count(*) FROM episodes WHERE season_id = $1) WHERE id = $1`,
        [rows[0].season_id],
      );
    }
    res.json({ ok: true });
  }),
);

// ----------------------------------------------------------- video sources ---

router.post(
  '/content/:id/sources',
  asyncHandler(async (req, res) => {
    const contentId = Number(req.params.id);
    const payload = parse(
      z.object({
        episodeId: z.coerce.number().int().positive().nullable().optional(),
        label: z.string().trim().min(1, 'برچسب منبع الزامی است.').max(120),
        quality: z.string().trim().max(20).optional(),
        sourceKind: z.enum(['hls', 'mp4']).default('hls'),
        url: z.string().trim().url('آدرس منبع معتبر نیست.').max(1000),
        isDefault: z.boolean().optional(),
        requiresPremium: z.boolean().optional(),
      }),
      req.body,
    );

    const { rows } = await query(
      `INSERT INTO video_sources
         (content_id, episode_id, label, quality, source_kind, url, is_default, requires_premium)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        payload.episodeId ? null : contentId,
        payload.episodeId ?? null,
        payload.label,
        payload.quality ?? null,
        payload.sourceKind,
        payload.url,
        payload.isDefault ?? false,
        payload.requiresPremium ?? true,
      ],
    );
    await logAudit({ userId: req.user.id, action: 'source.create', entity: 'video_sources', entityId: rows[0].id, ip: req.ip });
    res.status(201).json({ source: rows[0] });
  }),
);

router.delete(
  '/sources/:id',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM video_sources WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------------ taxonomy --

router.get(
  '/genres',
  asyncHandler(async (_req, res) => {
    const { rows } = await query('SELECT * FROM genres ORDER BY sort_order, id');
    res.json({ items: rows });
  }),
);

router.post(
  '/genres',
  asyncHandler(async (req, res) => {
    const payload = parse(
      z.object({
        slug: z.string().trim().min(2).max(60),
        nameFa: z.string().trim().min(1).max(80),
        nameEn: z.string().trim().min(1).max(80),
        sortOrder: z.coerce.number().int().optional(),
      }),
      req.body,
    );
    const { rows } = await query(
      `INSERT INTO genres (slug, name_fa, name_en, sort_order) VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE SET name_fa = EXCLUDED.name_fa, name_en = EXCLUDED.name_en
       RETURNING *`,
      [payload.slug, payload.nameFa, payload.nameEn, payload.sortOrder ?? 100],
    );
    await logAudit({ userId: req.user.id, action: 'genre.upsert', entity: 'genres', entityId: rows[0].id, ip: req.ip });
    res.status(201).json({ genre: rows[0] });
  }),
);

router.delete(
  '/genres/:id',
  requireStrictAdmin,
  asyncHandler(async (req, res) => {
    await query('DELETE FROM genres WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  }),
);

router.get(
  '/countries',
  asyncHandler(async (_req, res) => {
    const { rows } = await query('SELECT * FROM countries ORDER BY name_fa');
    res.json({ items: rows });
  }),
);

router.post(
  '/countries',
  asyncHandler(async (req, res) => {
    const payload = parse(
      z.object({
        code: z.string().trim().length(2).toLowerCase(),
        nameFa: z.string().trim().min(1).max(80),
        nameEn: z.string().trim().min(1).max(80),
      }),
      req.body,
    );
    const { rows } = await query(
      `INSERT INTO countries (code, name_fa, name_en) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET name_fa = EXCLUDED.name_fa, name_en = EXCLUDED.name_en
       RETURNING *`,
      [payload.code, payload.nameFa, payload.nameEn],
    );
    res.status(201).json({ country: rows[0] });
  }),
);

router.get(
  '/people',
  asyncHandler(async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().max(120).optional().default('') }), req.query);
    const { rows } = await query(
      `SELECT * FROM people
        WHERE ($1 = '' OR lower(name_en) ILIKE '%' || lower($1) || '%' OR name_fa ILIKE '%' || $1 || '%')
        ORDER BY name_en LIMIT 50`,
      [q],
    );
    res.json({ items: rows });
  }),
);

router.post(
  '/people',
  asyncHandler(async (req, res) => {
    const payload = parse(
      z.object({
        nameEn: z.string().trim().min(1).max(120),
        nameFa: z.string().trim().max(120).optional(),
        photoUrl: z.string().trim().max(500).optional(),
        birthYear: z.coerce.number().int().min(1800).max(2100).optional(),
      }),
      req.body,
    );
    const slug = slugify(payload.nameEn);
    const { rows } = await query(
      `INSERT INTO people (slug, name_en, name_fa, photo_url, birth_year)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (slug) DO UPDATE SET name_fa = EXCLUDED.name_fa, photo_url = EXCLUDED.photo_url
       RETURNING *`,
      [slug, payload.nameEn, payload.nameFa ?? null, payload.photoUrl ?? null, payload.birthYear ?? null],
    );
    res.status(201).json({ person: rows[0] });
  }),
);

router.post(
  '/content/:id/people',
  asyncHandler(async (req, res) => {
    const contentId = Number(req.params.id);
    const payload = parse(
      z.object({
        personId: z.coerce.number().int().positive(),
        role: z.enum(['director', 'actor', 'writer']),
        characterName: z.string().trim().max(120).optional(),
        sortOrder: z.coerce.number().int().optional(),
      }),
      req.body,
    );
    await query(
      `INSERT INTO content_people (content_id, person_id, role, character_name, sort_order)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (content_id, person_id, role)
       DO UPDATE SET character_name = EXCLUDED.character_name, sort_order = EXCLUDED.sort_order`,
      [contentId, payload.personId, payload.role, payload.characterName ?? null, payload.sortOrder ?? 100],
    );
    res.status(201).json({ ok: true });
  }),
);

// ------------------------------------------------------------------- users ---

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const params = parse(
      z.object({
        q: z.string().trim().max(120).optional().default(''),
        role: z.enum(['user', 'support', 'admin']).optional(),
        blocked: z.enum(['true', 'false']).optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(60).optional(),
      }),
      req.query,
    );
    const { page, pageSize, offset } = parsePagination(params, { defaultSize: 20 });

    const where = ['1 = 1'];
    const values = [];
    const push = (value) => {
      values.push(value);
      return `$${values.length}`;
    };
    if (params.q) {
      const like = push(`%${params.q}%`);
      where.push(`(u.email ILIKE ${like} OR u.full_name ILIKE ${like})`);
    }
    if (params.role) where.push(`u.role = ${push(params.role)}`);
    if (params.blocked) where.push(`u.is_blocked = ${push(params.blocked === 'true')}`);
    const clause = where.join(' AND ');

    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_blocked, u.blocked_reason,
              u.created_at, u.last_login_at,
              (SELECT us.ends_at FROM user_subscriptions us
                WHERE us.user_id = u.id AND us.status = 'active' AND us.ends_at > now()
                ORDER BY us.ends_at DESC LIMIT 1) AS subscription_ends_at
         FROM users u
        WHERE ${clause}
        ORDER BY u.created_at DESC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    );
    const { rows: countRows } = await query(
      `SELECT count(*)::int AS total FROM users u WHERE ${clause}`,
      values,
    );
    res.json(paginated(rows, countRows[0].total, { page, pageSize }));
  }),
);

router.patch(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id);
    const payload = parse(
      z.object({
        role: z.enum(['user', 'support', 'admin']).optional(),
        isBlocked: z.boolean().optional(),
        blockedReason: z.string().trim().max(300).nullable().optional(),
        fullName: z.string().trim().max(120).nullable().optional(),
      }),
      req.body,
    );

    if (userId === req.user.id && (payload.isBlocked === true || (payload.role && payload.role !== 'admin'))) {
      throw badRequest('نمی‌توانید دسترسی حساب خودتان را محدود کنید.');
    }
    if (payload.isBlocked === true && !payload.blockedReason) {
      throw badRequest('برای مسدودسازی حساب، ثبت دلیل الزامی است.');
    }
    // Only a full admin may change roles.
    if (payload.role && req.user.role !== 'admin') {
      throw badRequest('تغییر نقش کاربران فقط توسط مدیر اصلی امکان‌پذیر است.');
    }

    const fieldMap = {
      role: 'role',
      isBlocked: 'is_blocked',
      blockedReason: 'blocked_reason',
      fullName: 'full_name',
    };
    const { columns, values } = buildAssignments(fieldMap, payload);
    if (!columns.length) throw badRequest('تغییری ارسال نشده است.');
    values.push(userId);

    await query(`UPDATE users SET ${columns.join(', ')} WHERE id = $${values.length}`, values);

    // Blocking must terminate existing sessions immediately.
    if (payload.isBlocked === true) {
      await query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    }

    await logAudit({
      userId: req.user.id,
      action: 'user.update',
      entity: 'users',
      entityId: userId,
      meta: payload,
      ip: req.ip,
    });
    res.json({ ok: true });
  }),
);

// --------------------------------------------------------------- homepage ----

router.get(
  '/homepage-sections',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT s.*, COALESCE((
         SELECT json_agg(json_build_object(
                  'id', c.id, 'titleFa', c.title_fa, 'titleEn', c.title_en,
                  'posterUrl', c.poster_url, 'sortOrder', si.sort_order)
                ORDER BY si.sort_order)
           FROM homepage_section_items si JOIN content c ON c.id = si.content_id
          WHERE si.section_id = s.id
       ), '[]'::json) AS items
         FROM homepage_sections s
        ORDER BY s.sort_order, s.id`,
    );
    res.json({ items: rows });
  }),
);

router.patch(
  '/homepage-sections/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const payload = parse(
      z.object({
        titleFa: z.string().trim().min(1).max(120).optional(),
        subtitle: z.string().trim().max(300).nullable().optional(),
        layout: z.enum(['row', 'grid']).optional(),
        sourceType: z.enum(['trending', 'popular', 'top_rated', 'new', 'awards', 'genre', 'custom']).optional(),
        sourceValue: z.string().trim().max(60).nullable().optional(),
        maxItems: z.coerce.number().int().min(1).max(60).optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.coerce.number().int().optional(),
      }),
      req.body,
    );
    const { columns, values } = buildAssignments(SECTION_FIELDS, payload);
    if (!columns.length) throw badRequest('تغییری ارسال نشده است.');
    values.push(id);
    await query(`UPDATE homepage_sections SET ${columns.join(', ')} WHERE id = $${values.length}`, values);
    await logAudit({ userId: req.user.id, action: 'homepage.update', entity: 'homepage_sections', entityId: id, ip: req.ip });
    res.json({ ok: true });
  }),
);

router.put(
  '/homepage-sections/:id/items',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { contentIds } = parse(
      z.object({ contentIds: z.array(z.coerce.number().int().positive()).max(60) }),
      req.body,
    );

    await withTransaction(async (client) => {
      await client.query('DELETE FROM homepage_section_items WHERE section_id = $1', [id]);
      for (const [index, contentId] of contentIds.entries()) {
        await client.query(
          `INSERT INTO homepage_section_items (section_id, content_id, sort_order)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [id, contentId, index],
        );
      }
      await client.query(
        `UPDATE homepage_sections SET source_type = 'custom', source_value = NULL WHERE id = $1`,
        [id],
      );
    });

    await logAudit({ userId: req.user.id, action: 'homepage.items', entity: 'homepage_sections', entityId: id, ip: req.ip });
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------------ banners --

router.get(
  '/banners',
  asyncHandler(async (_req, res) => {
    const { rows } = await query('SELECT * FROM banners ORDER BY sort_order, id');
    res.json({ items: rows });
  }),
);

router.post(
  '/banners',
  asyncHandler(async (req, res) => {
    const payload = parse(
      z.object({
        titleFa: z.string().trim().min(1).max(200),
        subtitle: z.string().trim().max(400).optional(),
        imageUrl: z.string().trim().max(500).optional(),
        linkUrl: z.string().trim().max(500).optional(),
        placement: z.string().trim().max(40).optional(),
        sortOrder: z.coerce.number().int().optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );
    const { rows } = await query(
      `INSERT INTO banners (title_fa, subtitle, image_url, link_url, placement, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [payload.titleFa, payload.subtitle ?? null, payload.imageUrl ?? null, payload.linkUrl ?? null,
        payload.placement ?? 'home', payload.sortOrder ?? 100, payload.isActive ?? true],
    );
    res.status(201).json({ banner: rows[0] });
  }),
);

router.patch(
  '/banners/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const payload = parse(
      z.object({
        titleFa: z.string().trim().min(1).max(200).optional(),
        subtitle: z.string().trim().max(400).nullable().optional(),
        imageUrl: z.string().trim().max(500).nullable().optional(),
        linkUrl: z.string().trim().max(500).nullable().optional(),
        placement: z.string().trim().max(40).optional(),
        sortOrder: z.coerce.number().int().optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );
    const { columns, values } = buildAssignments(BANNER_FIELDS, payload);
    if (!columns.length) throw badRequest('تغییری ارسال نشده است.');
    values.push(id);
    await query(`UPDATE banners SET ${columns.join(', ')} WHERE id = $${values.length}`, values);
    res.json({ ok: true });
  }),
);

router.delete(
  '/banners/:id',
  asyncHandler(async (req, res) => {
    await query('DELETE FROM banners WHERE id = $1', [Number(req.params.id)]);
    res.json({ ok: true });
  }),
);

// ----------------------------------------------------------------- settings --

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getSettings() });
  }),
);

router.patch(
  '/settings',
  requireStrictAdmin,
  asyncHandler(async (req, res) => {
    const payload = parse(
      z.record(z.union([z.string().max(2000), z.boolean(), z.number()])),
      req.body,
    );
    const settings = await updateSettings(payload);
    await logAudit({
      userId: req.user.id,
      action: 'settings.update',
      entity: 'site_settings',
      meta: { keys: Object.keys(payload) },
      ip: req.ip,
    });
    res.json({ settings });
  }),
);

// -------------------------------------------------------------- audit & logs -

router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query, { defaultSize: 30 });
    const { rows } = await query(
      `SELECT a.id, a.action, a.entity, a.entity_id, a.meta, a.created_at, u.email
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
    const { rows: countRows } = await query('SELECT count(*)::int AS total FROM audit_logs');
    res.json(paginated(rows, countRows[0].total, { page, pageSize }));
  }),
);

router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query, { defaultSize: 30 });
    const { rows } = await query(
      `SELECT p.*, u.email, sp.name_fa AS plan_name
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN subscription_plans sp ON sp.id = p.plan_id
        ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset],
    );
    const { rows: countRows } = await query('SELECT count(*)::int AS total FROM payments');
    res.json(paginated(rows, countRows[0].total, { page, pageSize }));
  }),
);
