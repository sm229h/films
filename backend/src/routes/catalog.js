import { Router } from 'express';
import { z } from 'zod';

import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { notFound } from '../lib/http-error.js';
import { paginated, parsePagination } from '../lib/pagination.js';
import { parse } from '../lib/validate.js';
import { readLimiter } from '../middleware/rate-limit.js';
import {
  getContentDetail,
  getPersonCredits,
  listCatalog,
  searchContent,
} from '../services/catalog.js';

export const router = Router();

const filtersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  kind: z.enum(['movie', 'series']).optional(),
  genre: z.string().trim().max(60).optional(),
  country: z.string().trim().length(2).optional(),
  language: z.string().trim().max(40).optional(),
  quality: z.string().trim().max(20).optional(),
  yearFrom: z.coerce.number().int().min(1900).max(2100).optional(),
  yearTo: z.coerce.number().int().min(1900).max(2100).optional(),
  minRating: z.coerce.number().min(0).max(10).optional(),
  access: z.enum(['free', 'premium']).optional(),
  awards: z.coerce.boolean().optional(),
  sort: z.enum(['latest', 'oldest', 'popular', 'rating', 'az', 'za']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
});

// --- catalog listing ---------------------------------------------------------

router.get(
  '/catalog',
  readLimiter,
  asyncHandler(async (req, res) => {
    res.json(await listCatalog(parse(filtersSchema, req.query)));
  }),
);

for (const kind of ['movies', 'series']) {
  router.get(
    `/${kind}`,
    readLimiter,
    asyncHandler(async (req, res) => {
      const filters = parse(filtersSchema, req.query);
      res.json(await listCatalog({ ...filters, kind: kind === 'series' ? 'series' : 'movie' }));
    }),
  );
}

// --- single title ------------------------------------------------------------

router.get(
  '/titles/:identifier',
  readLimiter,
  asyncHandler(async (req, res) => {
    const detail = await getContentDetail(req.params.identifier);
    if (!detail) throw notFound('محتوا پیدا نشد.');
    res.json(detail);
  }),
);

router.get(
  '/content/:identifier',
  readLimiter,
  asyncHandler(async (req, res) => {
    const detail = await getContentDetail(req.params.identifier);
    if (!detail) throw notFound('محتوا پیدا نشد.');
    res.json(detail);
  }),
);

router.get(
  '/titles/:identifier/similar',
  asyncHandler(async (req, res) => {
    const detail = await getContentDetail(req.params.identifier);
    if (!detail) throw notFound('محتوا پیدا نشد.');
    res.json({ items: detail.similar });
  }),
);

// --- taxonomy ----------------------------------------------------------------

router.get(
  '/genres',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT g.id, g.slug, g.name_fa, g.name_en,
              (SELECT count(*) FROM content_genres cg
                 JOIN content c ON c.id = cg.content_id
                WHERE cg.genre_id = g.id AND c.status = 'published')::int AS title_count
         FROM genres g
        ORDER BY g.sort_order, g.id`,
    );
    res.json({ items: rows });
  }),
);

router.get(
  '/countries',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT co.id, co.code, co.name_fa, co.name_en,
              (SELECT count(*) FROM content c
                WHERE c.country_id = co.id AND c.status = 'published')::int AS title_count
         FROM countries co
        ORDER BY co.name_fa`,
    );
    res.json({ items: rows });
  }),
);

router.get(
  '/filters',
  asyncHandler(async (_req, res) => {
    const [genres, countries, languages, years, qualities] = await Promise.all([
      query(`SELECT slug AS value, name_fa AS label FROM genres ORDER BY sort_order`),
      query(`SELECT code AS value, name_fa AS label FROM countries ORDER BY name_fa`),
      query(`SELECT DISTINCT original_language AS value, original_language AS label
               FROM content WHERE original_language IS NOT NULL ORDER BY 1`),
      query(`SELECT DISTINCT release_year AS value FROM content
              WHERE release_year IS NOT NULL ORDER BY 1 DESC`),
      query(`SELECT DISTINCT quality AS value FROM content
              WHERE quality IS NOT NULL ORDER BY 1`),
    ]);
    res.json({
      genres: genres.rows,
      countries: countries.rows,
      languages: languages.rows,
      years: years.rows.map((row) => ({ value: row.value, label: String(row.value) })),
      qualities: qualities.rows.map((row) => ({ value: row.value, label: row.value })),
    });
  }),
);

// --- search ------------------------------------------------------------------

router.get(
  '/search',
  readLimiter,
  asyncHandler(async (req, res) => {
    const params = parse(
      filtersSchema.extend({
        q: z.string().trim().max(120).optional().default(''),
        pageSize: z.coerce.number().int().min(1).max(40).optional(),
      }),
      req.query,
    );
    const { q, page, pageSize, ...filters } = params;
    const result = await searchContent(q, { page: page ?? 1, limit: pageSize ?? 20, ...filters });
    res.json({ ...result, query: q });
  }),
);

/** Autocomplete: titles first, then matching people. */
router.get(
  '/search/suggest',
  readLimiter,
  asyncHandler(async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().max(120).default('') }), req.query);
    if (q.trim().length < 2) return res.json({ titles: [], people: [] });

    const term = q.replace(/\u200c/g, '');
    const [titles, people] = await Promise.all([
      query(
        `SELECT c.id, c.kind, c.slug, c.title_fa, c.title_en, c.release_year, c.poster_url
           FROM content c
          WHERE c.status = 'published'
            AND (regexp_replace(c.title_fa, chr(8204), '', 'g') ILIKE $1
                 OR lower(c.title_en) ILIKE $2)
          ORDER BY c.rating_votes DESC NULLS LAST
          LIMIT 7`,
        [`%${term}%`, `%${q.trim().toLowerCase()}%`],
      ),
      query(
        `SELECT id, slug, name_fa, name_en, photo_url
           FROM people
          WHERE lower(name_en) ILIKE $1 OR name_fa ILIKE $2
          ORDER BY name_en
          LIMIT 4`,
        [`%${q.trim().toLowerCase()}%`, `%${term}%`],
      ),
    ]);

    res.json({ titles: titles.rows, people: people.rows });
  }),
);

/** People search (cast / crew). */
router.get(
  '/people/search',
  readLimiter,
  asyncHandler(async (req, res) => {
    const params = parse(
      z.object({ q: z.string().trim().max(120).default(''), page: z.coerce.number().int().min(1).optional() }),
      req.query,
    );
    const { page, pageSize, offset } = parsePagination(params, { defaultSize: 24 });
    const term = `%${params.q.replace(/\u200c/g, '')}%`;
    const english = `%${params.q.toLowerCase()}%`;

    const { rows } = await query(
      `SELECT p.id, p.slug, p.name_fa, p.name_en, p.photo_url, p.birth_year,
              (SELECT count(*) FROM content_people cp WHERE cp.person_id = p.id)::int AS credit_count
         FROM people p
        WHERE lower(p.name_en) ILIKE $1 OR p.name_fa ILIKE $2
        ORDER BY p.name_en
        LIMIT $3 OFFSET $4`,
      [english, term, pageSize, offset],
    );

    const { rows: countRows } = await query(
      `SELECT count(*)::int AS total FROM people
        WHERE lower(name_en) ILIKE $1 OR name_fa ILIKE $2`,
      [english, term],
    );

    res.json(paginated(rows, countRows[0].total, { page, pageSize }));
  }),
);

router.get(
  '/people/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM people WHERE id = $1', [Number(req.params.id)]);
    if (!rows[0]) throw notFound('این شخص پیدا نشد.');
    res.json({ person: rows[0], credits: await getPersonCredits(rows[0].id) });
  }),
);

// --- related titles for a person (used on detail pages) ----------------------

router.get(
  '/content/:id/related-by-person/:personId',
  asyncHandler(async (req, res) => {
    const credits = await getPersonCredits(Number(req.params.personId));
    res.json({ items: credits.filter((item) => item.id !== Number(req.params.id)) });
  }),
);


