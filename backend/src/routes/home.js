import { Router } from 'express';

import { query } from '../db/pool.js';
import { asyncHandler } from '../lib/async-handler.js';
import { readLimiter } from '../middleware/rate-limit.js';
import { CONTENT_CARD_COLUMNS, CONTENT_CARD_JOINS } from '../services/catalog.js';

export const router = Router();

/**
 * Dynamic rows. `$1` is the item limit and `$2` an optional content kind, which
 * is how the admin picks "popular movies" vs "popular series" from the same row
 * type without duplicating queries.
 */
const KIND_FILTER = 'AND ($2::text IS NULL OR c.kind = $2::content_kind)';

const SECTION_QUERIES = {
  trending: `
    SELECT ${CONTENT_CARD_COLUMNS}, count(wh.id)::int AS recent_views
      ${CONTENT_CARD_JOINS}
      LEFT JOIN watch_history wh
        ON wh.content_id = c.id AND wh.watched_at > now() - interval '7 days'
     WHERE c.status = 'published' ${KIND_FILTER}
     GROUP BY c.id, co.name_fa
     HAVING count(wh.id) > 0
     ORDER BY recent_views DESC, c.rating_votes DESC NULLS LAST
     LIMIT $1`,
  popular: `
    SELECT ${CONTENT_CARD_COLUMNS}
      ${CONTENT_CARD_JOINS}
     WHERE c.status = 'published' ${KIND_FILTER}
     ORDER BY c.rating_votes DESC NULLS LAST, c.rating_value DESC NULLS LAST
     LIMIT $1`,
  top_rated: `
    SELECT ${CONTENT_CARD_COLUMNS}
      ${CONTENT_CARD_JOINS}
     WHERE c.status = 'published' AND c.rating_value IS NOT NULL ${KIND_FILTER}
     ORDER BY c.rating_value DESC, c.rating_votes DESC NULLS LAST
     LIMIT $1`,
  new: `
    SELECT ${CONTENT_CARD_COLUMNS}
      ${CONTENT_CARD_JOINS}
     WHERE c.status = 'published' ${KIND_FILTER}
     ORDER BY COALESCE(c.released_at, make_date(c.release_year, 1, 1)) DESC NULLS LAST,
              c.created_at DESC
     LIMIT $1`,
  awards: `
    SELECT ${CONTENT_CARD_COLUMNS}
      ${CONTENT_CARD_JOINS}
     WHERE c.status = 'published' AND c.has_awards = true ${KIND_FILTER}
     ORDER BY c.rating_value DESC NULLS LAST
     LIMIT $1`,
};

/** Resolves one homepage section definition into its list of cards. */
async function resolveSection(section, user) {
  const limit = section.max_items;

  if (section.source_type === 'continue_watching') {
    if (!user) return [];
    const { rows } = await query(
      `SELECT ${CONTENT_CARD_COLUMNS},
              wp.position_seconds, wp.duration_seconds, wp.updated_at,
              wp.episode_id
         ${CONTENT_CARD_JOINS}
         JOIN watch_progress wp ON wp.content_id = c.id AND wp.user_id = $2
        WHERE c.status = 'published' AND wp.completed = false
        ORDER BY wp.updated_at DESC
        LIMIT $1`,
      [limit, user.id],
    );
    return rows;
  }

  if (section.source_type === 'genre') {
    const { rows } = await query(
      `SELECT ${CONTENT_CARD_COLUMNS}
         ${CONTENT_CARD_JOINS}
         JOIN content_genres cg ON cg.content_id = c.id
         JOIN genres g ON g.id = cg.genre_id
        WHERE c.status = 'published' AND g.slug = $2
        ORDER BY c.rating_votes DESC NULLS LAST
        LIMIT $1`,
      [limit, section.source_value],
    );
    return rows;
  }

  if (section.source_type === 'custom') {
    const { rows } = await query(
      `SELECT ${CONTENT_CARD_COLUMNS}
         ${CONTENT_CARD_JOINS}
         JOIN homepage_section_items si ON si.content_id = c.id
        WHERE si.section_id = $2 AND c.status = 'published'
        ORDER BY si.sort_order
        LIMIT $1`,
      [limit, section.id],
    );
    return rows;
  }

  const sql = SECTION_QUERIES[section.source_type];
  if (!sql) return [];
  // For dynamic rows, source_value optionally narrows the result to movies or
  // series (genre rows use it as the genre slug, handled above).
  const kind = ['movie', 'series'].includes(section.source_value) ? section.source_value : null;
  const { rows } = await query(sql, [limit, kind]);
  return rows;
}

router.get(
  '/home',
  readLimiter,
  asyncHandler(async (req, res) => {
    const [sectionsResult, bannersResult, heroResult] = await Promise.all([
      query(
        `SELECT * FROM homepage_sections
          WHERE is_active = true AND layout <> 'hero'
          ORDER BY sort_order, id`,
      ),
      query(
        `SELECT id, title_fa, subtitle, image_url, link_url, placement
           FROM banners
          WHERE is_active = true
            AND (starts_at IS NULL OR starts_at <= now())
            AND (ends_at IS NULL OR ends_at >= now())
          ORDER BY sort_order, id`,
      ),
      query(
        `SELECT ${CONTENT_CARD_COLUMNS}
           ${CONTENT_CARD_JOINS}
          WHERE c.status = 'published'
          ORDER BY c.is_featured DESC, c.featured_rank NULLS LAST,
                   c.rating_value DESC NULLS LAST
          LIMIT 6`,
      ),
    ]);

    const sections = [];
    for (const section of sectionsResult.rows) {
      const items = await resolveSection(section, req.user);
      if (!items.length) continue;
      sections.push({
        key: section.key,
        title: section.title_fa,
        subtitle: section.subtitle,
        layout: section.layout,
        sourceType: section.source_type,
        items,
      });
    }

    res.json({ hero: heroResult.rows, sections, banners: bannersResult.rows });
  }),
);

router.get(
  '/banners',
  asyncHandler(async (req, res) => {
    const placement = typeof req.query.placement === 'string' ? req.query.placement : 'home';
    const { rows } = await query(
      `SELECT id, title_fa, subtitle, image_url, link_url, placement
         FROM banners
        WHERE is_active = true AND placement = $1
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at >= now())
        ORDER BY sort_order, id`,
      [placement],
    );
    res.json({ items: rows });
  }),
);
