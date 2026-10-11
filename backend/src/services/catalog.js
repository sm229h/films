import { query } from '../db/pool.js';
import { paginated, parsePagination } from '../lib/pagination.js';

/**
 * Every list endpoint returns the same card shape, so the UI can render any
 * collection with one component.
 */
export const CONTENT_CARD_COLUMNS = `
  c.id, c.kind, c.slug, c.title_fa, c.title_en, c.release_year, c.end_year,
  c.runtime_minutes, c.rating_value, c.rating_votes, c.rating_source, c.quality,
  c.poster_url, c.backdrop_url, c.access, c.status, c.age_rating,
  c.synopsis_short, c.has_awards, c.original_language,
  co.name_fa AS country_fa,
  COALESCE((
    SELECT json_agg(json_build_object('slug', g.slug, 'nameFa', g.name_fa, 'nameEn', g.name_en)
                    ORDER BY g.sort_order)
      FROM content_genres cg JOIN genres g ON g.id = cg.genre_id
     WHERE cg.content_id = c.id
  ), '[]'::json) AS genres,
  (SELECT count(*) FROM seasons s WHERE s.content_id = c.id)::int AS season_count,
  (SELECT sum(s.episode_count) FROM seasons s WHERE s.content_id = c.id)::int AS episode_count
`;

export const CONTENT_CARD_JOINS = `
  FROM content c
  LEFT JOIN countries co ON co.id = c.country_id
`;

export const SORTS = {
  latest: 'c.release_year DESC NULLS LAST, c.created_at DESC',
  oldest: 'c.release_year ASC NULLS LAST',
  popular: 'c.rating_votes DESC NULLS LAST, c.rating_value DESC NULLS LAST',
  rating: 'c.rating_value DESC NULLS LAST, c.rating_votes DESC NULLS LAST',
  az: 'c.title_en ASC',
  za: 'c.title_en DESC',
};

const ACCESS_VALUES = new Set(['free', 'premium']);

/**
 * Builds the shared WHERE clause for catalog/search/homepage queries from
 * validated filter input. Returns parameterised SQL only — no interpolation of
 * user values.
 */
export function buildFilters(filters = {}, startIndex = 1) {
  const where = [`c.status = 'published'`];
  const params = [];
  const push = (value) => {
    params.push(value);
    return `$${startIndex + params.length - 1}`;
  };

  if (filters.kind) where.push(`c.kind = ${push(filters.kind)}`);
  if (filters.genre) {
    const param = push(filters.genre);
    where.push(
      `EXISTS (SELECT 1 FROM content_genres cg JOIN genres g ON g.id = cg.genre_id
                WHERE cg.content_id = c.id AND g.slug = ${param})`,
    );
  }
  if (filters.country) where.push(`co.code = ${push(filters.country)}`);
  if (filters.language) where.push(`c.original_language = ${push(filters.language)}`);
  if (filters.quality) where.push(`c.quality = ${push(filters.quality)}`);
  if (filters.yearFrom) where.push(`c.release_year >= ${push(Number(filters.yearFrom))}`);
  if (filters.yearTo) where.push(`c.release_year <= ${push(Number(filters.yearTo))}`);
  if (filters.minRating) where.push(`c.rating_value >= ${push(Number(filters.minRating))}`);
  if (filters.access && ACCESS_VALUES.has(filters.access)) {
    where.push(`c.access = ${push(filters.access)}`);
  }
  if (filters.awards) where.push(`c.has_awards = true`);

  // `q` is the query-string name; `query` is the internal one.
  const term = filters.query ?? filters.q;
  if (term) {
    // ZWNJ (نیم‌فاصله) is stripped on both sides so "بیخانمان" matches "بی‌خانمان".
    const param = push(`%${String(term).replace(/\u200c/g, '')}%`);
    const lowered = push(`%${String(term).toLowerCase()}%`);
    where.push(`(
      regexp_replace(c.title_fa, chr(8204), '', 'g') ILIKE ${param}
      OR lower(c.title_en) ILIKE ${lowered}
    )`);
  }

  return { clause: where.join(' AND '), params };
}

export async function listCatalog(filters = {}) {
  const { page, pageSize, offset } = parsePagination(filters, {
    defaultSize: filters.pageSize ? Number(filters.pageSize) : 24,
  });
  const orderBy = SORTS[filters.sort] || SORTS.latest;

  const base = buildFilters(filters, 1);
  const countSql = `SELECT count(*)::int AS total ${CONTENT_CARD_JOINS} WHERE ${base.clause}`;
  const { rows: countRows } = await query(countSql, base.params);

  const listParams = [...base.params, pageSize, offset];
  const listSql = `
    SELECT ${CONTENT_CARD_COLUMNS}
    ${CONTENT_CARD_JOINS}
    WHERE ${base.clause}
    ORDER BY ${orderBy}
    LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
  `;
  const { rows } = await query(listSql, listParams);

  return paginated(rows, countRows[0].total, { page, pageSize });
}

/**
 * Ranked search across Persian and English titles. Rank 0 = Persian title hit,
 * 1 = original title hit, 2 = partial/other. ZWNJ is stripped so searches typed
 * without نیم‌فاصله still match.
 */
export async function searchContent(term, { limit = 20, page = 1, ...filters } = {}) {
  const cleaned = String(term || '').trim();
  if (!cleaned) return paginated([], 0, { page: 1, pageSize: limit });

  const base = buildFilters({ ...filters, query: cleaned }, 1);
  const { rows: countRows } = await query(
    `SELECT count(*)::int AS total ${CONTENT_CARD_JOINS} WHERE ${base.clause}`,
    base.params,
  );

  const likeParam = `$${base.params.length + 1}`;
  const limitParam = `$${base.params.length + 2}`;
  const offsetParam = `$${base.params.length + 3}`;
  const offset = (Math.max(1, page) - 1) * limit;

  const { rows } = await query(
    `SELECT ${CONTENT_CARD_COLUMNS},
            CASE
              WHEN regexp_replace(c.title_fa, chr(8204), '', 'g') ILIKE ${likeParam} THEN 0
              WHEN lower(c.title_en) ILIKE ${likeParam} THEN 1
              ELSE 2
            END AS rank
     ${CONTENT_CARD_JOINS}
     WHERE ${base.clause}
     ORDER BY rank, c.rating_votes DESC NULLS LAST
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    [...base.params, `%${cleaned.replace(/\u200c/g, '')}%`, limit, offset],
  );

  return paginated(rows, countRows[0].total, { page: Math.max(1, page), pageSize: limit });
}

/** Full detail payload for a single title, including cast, seasons and reviews. */
export async function getContentDetail(identifier) {
  const numeric = /^\d+$/.test(String(identifier));
  const { rows } = await query(
    `SELECT c.*, co.code AS country_code, co.name_fa AS country_fa, co.name_en AS country_en,
            COALESCE((
              SELECT json_agg(json_build_object('slug', g.slug, 'nameFa', g.name_fa, 'nameEn', g.name_en)
                              ORDER BY g.sort_order)
                FROM content_genres cg JOIN genres g ON g.id = cg.genre_id
               WHERE cg.content_id = c.id
            ), '[]'::json) AS genres
       FROM content c
       LEFT JOIN countries co ON co.id = c.country_id
      WHERE ${numeric ? 'c.id = $1' : 'c.slug = $1'}`,
    [numeric ? Number(identifier) : identifier],
  );
  const content = rows[0];
  if (!content) return null;

  const [people, seasons, reviews] = await Promise.all([
    query(
      `SELECT p.id, p.slug, p.name_fa, p.name_en, p.photo_url, cp.role, cp.character_name
         FROM content_people cp JOIN people p ON p.id = cp.person_id
        WHERE cp.content_id = $1
        ORDER BY cp.role, cp.sort_order`,
      [content.id],
    ),
    query(
      `SELECT s.*, COALESCE((
         SELECT json_agg(json_build_object(
                  'id', e.id, 'number', e.episode_number, 'titleFa', e.title_fa,
                  'titleEn', e.title_en, 'synopsis', e.synopsis,
                  'runtimeMinutes', e.runtime_minutes,
                  'airDate', e.air_date, 'stillUrl', e.still_url)
                ORDER BY e.episode_number)
           FROM episodes e WHERE e.season_id = s.id
       ), '[]'::json) AS episodes
         FROM seasons s
        WHERE s.content_id = $1
        ORDER BY s.season_number`,
      [content.id],
    ),
    query(
      `SELECT r.rating, r.comment, r.created_at, u.full_name, u.email
         FROM reviews r JOIN users u ON u.id = r.user_id
        WHERE r.content_id = $1 AND r.status = 'published'
        ORDER BY r.created_at DESC
        LIMIT 50`,
      [content.id],
    ),
  ]);

  const similar = await query(
    `SELECT ${CONTENT_CARD_COLUMNS}
     ${CONTENT_CARD_JOINS}
     WHERE c.status = 'published' AND c.id <> $1 AND c.kind = $2
       AND EXISTS (
         SELECT 1 FROM content_genres cg
          WHERE cg.content_id = c.id AND cg.genre_id IN (
            SELECT genre_id FROM content_genres WHERE content_id = $1
          )
       )
     ORDER BY c.rating_votes DESC NULLS LAST
     LIMIT 12`,
    [content.id, content.kind],
  );

  return {
    content,
    cast: people.rows.filter((row) => row.role === 'actor'),
    crew: people.rows.filter((row) => row.role !== 'actor'),
    seasons: seasons.rows,
    reviews: reviews.rows,
    similar: similar.rows,
  };
}

/** Filmography for a person: everything they are credited on. */
export async function getPersonCredits(personId) {
  const { rows } = await query(
    `SELECT ${CONTENT_CARD_COLUMNS}, cp.role
     ${CONTENT_CARD_JOINS}
     JOIN content_people cp ON cp.content_id = c.id AND cp.person_id = $1
     WHERE c.status = 'published'
     ORDER BY c.release_year DESC NULLS LAST
     LIMIT 24`,
    [personId],
  );
  return rows;
}
