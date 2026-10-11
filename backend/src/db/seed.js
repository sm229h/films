import { pool, query, withTransaction } from './pool.js';
import { runMigrations } from './migrate.js';
import {
  banners,
  countries,
  genres,
  homepageSections,
  people,
  plans,
  SAMPLE_STREAMS,
  titles,
} from './seed-data.js';
import { hashPassword } from '../lib/auth.js';
import { DEFAULT_SETTINGS } from '../services/settings.js';

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@cineverse.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'CineVerse!2024';
const USER_EMAIL = process.env.SEED_USER_EMAIL || 'user@cineverse.local';
const USER_PASSWORD = process.env.SEED_USER_PASSWORD || 'CineVerse!2024';

// Placeholder artwork. The app labels these as sample images and falls back to a
// generated gradient when they cannot be loaded.
const posterFor = (slug) => `https://picsum.photos/seed/cv-${slug}/500/750`;
const backdropFor = (slug) => `https://picsum.photos/seed/cv-${slug}-bd/1600/900`;
const SAMPLE_TRAILER =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

const EPISODE_TITLES = [
  'آغاز', 'سایه‌ها', 'خط باریک', 'گره کور', 'نقطه بی‌بازگشت', 'پس‌لرزه',
  'دو راهی', 'پرده آخر', 'خون و خاک', 'سکوت طولانی', 'آینه شکسته', 'فصل توفان',
];

async function seedTaxonomy() {
  for (const country of countries) {
    await query(
      `INSERT INTO countries (code, name_fa, name_en) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET name_fa = EXCLUDED.name_fa, name_en = EXCLUDED.name_en`,
      [country.code, country.nameFa, country.nameEn],
    );
  }
  for (const genre of genres) {
    await query(
      `INSERT INTO genres (slug, name_fa, name_en, sort_order) VALUES ($1,$2,$3,$4)
       ON CONFLICT (slug) DO UPDATE SET name_fa = EXCLUDED.name_fa,
                                        name_en = EXCLUDED.name_en,
                                        sort_order = EXCLUDED.sort_order`,
      [genre.slug, genre.nameFa, genre.nameEn, genre.sort],
    );
  }
  for (const person of people) {
    await query(
      `INSERT INTO people (slug, name_en, name_fa, photo_url, birth_year)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (slug) DO UPDATE SET name_fa = EXCLUDED.name_fa,
                                        name_en = EXCLUDED.name_en`,
      [
        person.slug,
        person.nameEn,
        person.nameFa,
        `https://picsum.photos/seed/cv-p-${person.slug}/300/300`,
        person.birth,
      ],
    );
  }
}

async function seedTitles() {
  const { rows: genreRows } = await query('SELECT id, slug FROM genres');
  const genreId = new Map(genreRows.map((row) => [row.slug, row.id]));

  const { rows: countryRows } = await query('SELECT id, code FROM countries');
  const countryId = new Map(countryRows.map((row) => [row.code, row.id]));

  const { rows: peopleRows } = await query('SELECT id, slug FROM people');
  const personId = new Map(peopleRows.map((row) => [row.slug, row.id]));

  for (const title of titles) {
    const { rows } = await query(
      `INSERT INTO content
         (kind, slug, title_fa, title_en, synopsis_short, synopsis_full, release_year, end_year,
          runtime_minutes, age_rating, rating_source, rating_value, rating_votes, quality,
          country_id, original_language, poster_url, backdrop_url, trailer_url,
          has_awards, is_featured, featured_rank, status, access, released_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
               'published','premium',$23)
       ON CONFLICT (slug) DO UPDATE SET
         title_fa = EXCLUDED.title_fa, title_en = EXCLUDED.title_en,
         synopsis_short = EXCLUDED.synopsis_short, synopsis_full = EXCLUDED.synopsis_full,
         rating_value = EXCLUDED.rating_value, rating_votes = EXCLUDED.rating_votes,
         is_featured = EXCLUDED.is_featured, featured_rank = EXCLUDED.featured_rank,
         poster_url = EXCLUDED.poster_url, backdrop_url = EXCLUDED.backdrop_url
       RETURNING id`,
      [
        title.k,
        title.s,
        title.fa,
        title.en,
        title.short,
        title.full,
        title.y,
        title.en2 ?? null,
        title.k === 'movie' ? title.min : null,
        title.age ?? null,
        'IMDb (نمونه)',
        title.r,
        title.v,
        title.q,
        countryId.get(title.c) ?? null,
        title.l,
        posterFor(title.s),
        backdropFor(title.s),
        SAMPLE_TRAILER,
        Boolean(title.awards),
        Boolean(title.featured),
        title.featured ?? null,
        `${title.y}-01-01`,
      ],
    );
    const contentId = rows[0].id;

    // --- genres
    await query('DELETE FROM content_genres WHERE content_id = $1', [contentId]);
    for (const slug of title.g) {
      if (!genreId.has(slug)) continue;
      await query(
        `INSERT INTO content_genres (content_id, genre_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [contentId, genreId.get(slug)],
      );
    }

    // --- cast & crew
    await query('DELETE FROM content_people WHERE content_id = $1', [contentId]);
    for (const [index, slug] of (title.dir ?? []).entries()) {
      if (!personId.has(slug)) continue;
      await query(
        `INSERT INTO content_people (content_id, person_id, role, sort_order)
         VALUES ($1,$2,'director',$3) ON CONFLICT DO NOTHING`,
        [contentId, personId.get(slug), index],
      );
    }
    for (const [index, [slug, character]] of (title.cast ?? []).entries()) {
      if (!personId.has(slug)) continue;
      await query(
        `INSERT INTO content_people (content_id, person_id, role, character_name, sort_order)
         VALUES ($1,$2,'actor',$3,$4) ON CONFLICT DO NOTHING`,
        [contentId, personId.get(slug), character ?? null, index],
      );
    }

    // --- seasons & episodes (series only)
    if (title.k === 'series') {
      for (let seasonNumber = 1; seasonNumber <= title.se; seasonNumber += 1) {
        const { rows: seasonRows } = await query(
          `INSERT INTO seasons (content_id, season_number, title_fa, synopsis, air_year, poster_url)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (content_id, season_number)
           DO UPDATE SET title_fa = EXCLUDED.title_fa, synopsis = EXCLUDED.synopsis,
                         air_year = EXCLUDED.air_year, episode_count = EXCLUDED.episode_count
           RETURNING id`,
          [
            contentId,
            seasonNumber,
            `فصل ${seasonNumber}`,
            `${title.fa} — فصل ${seasonNumber}`,
            title.y + seasonNumber - 1,
            posterFor(`${title.s}-s${seasonNumber}`),
          ],
        );
        const seasonId = seasonRows[0].id;

        for (let episodeNumber = 1; episodeNumber <= title.eps; episodeNumber += 1) {
          await query(
            `INSERT INTO episodes
               (season_id, episode_number, title_fa, title_en, synopsis, runtime_minutes,
                air_date, still_url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (season_id, episode_number) DO UPDATE SET
               title_fa = EXCLUDED.title_fa, synopsis = EXCLUDED.synopsis,
               runtime_minutes = EXCLUDED.runtime_minutes, still_url = EXCLUDED.still_url`,
            [
              seasonId,
              episodeNumber,
              EPISODE_TITLES[(episodeNumber - 1) % EPISODE_TITLES.length],
              `Season ${seasonNumber} · Episode ${episodeNumber}`,
              `قسمت ${episodeNumber} از فصل ${seasonNumber} مجموعه ${title.fa}.`,
              40 + ((episodeNumber * 7) % 25),
              `${title.y + seasonNumber - 1}-01-01`,
              backdropFor(`${title.s}-s${seasonNumber}e${episodeNumber}`),
            ],
          );
        }

        await query(
          `UPDATE seasons SET episode_count = (SELECT count(*) FROM episodes WHERE season_id = $1)
            WHERE id = $1`,
          [seasonId],
        );
      }
    }

    // --- playable sources (public sample streams, clearly not real film files)
    const { rowCount } = await query('SELECT 1 FROM video_sources WHERE content_id = $1', [contentId]);
    if (!rowCount) {
      for (const stream of SAMPLE_STREAMS) {
        const { rows: sourceRows } = await query(
          `INSERT INTO video_sources
             (content_id, label, quality, source_kind, url, is_default, requires_premium)
           VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
          [contentId, stream.label, stream.quality, stream.sourceKind, stream.url, stream.isDefault],
        );
        if (stream.isDefault) {
          await query(
            `INSERT INTO subtitles (video_source_id, language_code, label, url, is_default)
             VALUES ($1,'fa','فارسی','/api/v1/static/subtitles/fa.vtt',true)
             ON CONFLICT DO NOTHING`,
            [sourceRows[0].id],
          );
          await query(
            `INSERT INTO audio_tracks (video_source_id, language_code, label, is_default)
             VALUES ($1,'fa','صدا و تصویر اصلی',true) ON CONFLICT DO NOTHING`,
            [sourceRows[0].id],
          );
        }
      }
    }
  }
}

async function seedPresentation() {
  for (const section of homepageSections) {
    await query(
      `INSERT INTO homepage_sections (key, title_fa, subtitle, source_type, source_value, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (key) DO UPDATE SET title_fa = EXCLUDED.title_fa,
                                       subtitle = EXCLUDED.subtitle,
                                       source_type = EXCLUDED.source_type,
                                       source_value = EXCLUDED.source_value,
                                       sort_order = EXCLUDED.sort_order`,
      [section.key, section.titleFa, section.subtitle ?? null, section.source, section.value ?? null, section.sort],
    );
  }

  for (const banner of banners) {
    const { rowCount } = await query('SELECT 1 FROM banners WHERE title_fa = $1', [banner.titleFa]);
    if (!rowCount) {
      await query(
        `INSERT INTO banners (title_fa, subtitle, placement, sort_order) VALUES ($1,$2,$3,$4)`,
        [banner.titleFa, banner.subtitle ?? null, banner.placement ?? 'home', banner.sort ?? 100],
      );
    }
  }

  for (const plan of plans) {
    await query(
      `INSERT INTO subscription_plans (code, name_fa, description, price_toman, duration_days, features, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
       ON CONFLICT (code) DO UPDATE SET name_fa = EXCLUDED.name_fa,
                                        description = EXCLUDED.description,
                                        price_toman = EXCLUDED.price_toman,
                                        duration_days = EXCLUDED.duration_days,
                                        features = EXCLUDED.features,
                                        sort_order = EXCLUDED.sort_order`,
      [plan.code, plan.nameFa, plan.description, plan.price, plan.days, JSON.stringify(plan.features), plan.sort],
    );
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await query(
      `INSERT INTO site_settings (key, value) VALUES ($1,$2::jsonb) ON CONFLICT DO NOTHING`,
      [key, JSON.stringify(value)],
    );
  }
}

async function seedDemoAccounts() {
  const accounts = [
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, name: 'مدیر سامانه', role: 'admin' },
    { email: USER_EMAIL, password: USER_PASSWORD, name: 'کاربر نمونه', role: 'user' },
    { email: 'support@cineverse.local', password: USER_PASSWORD, name: 'پشتیبان', role: 'support' },
  ];

  const ids = {};
  for (const account of accounts) {
    const passwordHash = await hashPassword(account.password);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name,
                                         role = EXCLUDED.role
       RETURNING id`,
      [account.email, passwordHash, account.name, account.role],
    );
    ids[account.email] = rows[0].id;
  }

  const userId = ids[USER_EMAIL];

  // Give the demo user an active subscription so premium gating can be exercised.
  const { rows: planRows } = await query(`SELECT id FROM subscription_plans WHERE code = 'quarterly'`);
  if (planRows[0]) {
    const { rowCount } = await query('SELECT 1 FROM user_subscriptions WHERE user_id = $1', [userId]);
    if (!rowCount) {
      await query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, starts_at, ends_at)
         VALUES ($1,$2,'active', now(), now() + interval '90 days')`,
        [userId, planRows[0].id],
      );
    }
  }

  // Favourites, partial watch progress and a couple of reviews.
  const { rows: sample } = await query(
    `SELECT id, slug, kind FROM content WHERE status = 'published' ORDER BY featured_rank NULLS LAST LIMIT 8`,
  );

  for (const [index, item] of sample.entries()) {
    if (index < 4) {
      await query(
        `INSERT INTO favorites (user_id, content_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [userId, item.id],
      );
    }
    if (index < 3) {
      await query(
        `INSERT INTO watch_progress (user_id, content_id, episode_id, position_seconds, duration_seconds, completed)
         VALUES ($1,$2,NULL,$3,$4,false)
         ON CONFLICT (user_id, content_id, episode_id) DO UPDATE
           SET position_seconds = EXCLUDED.position_seconds,
               duration_seconds = EXCLUDED.duration_seconds,
               updated_at = now()`,
        [userId, item.id, 600 + index * 300, 5400],
      );
      await query(
        `INSERT INTO watch_history (user_id, content_id, seconds_watched) VALUES ($1,$2,$3)`,
        [userId, item.id, 600 + index * 300],
      );
    }
  }

  // Simulated traffic so the "trending" row and admin stats are not empty.
  const { rows: traffic } = await query(
    `SELECT id FROM content WHERE status = 'published' ORDER BY rating_votes DESC NULLS LAST LIMIT 12`,
  );
  for (const [index, item] of traffic.entries()) {
    const views = 6 - Math.floor(index / 2);
    for (let i = 0; i < views; i += 1) {
      await query(
        `INSERT INTO watch_history (user_id, content_id, seconds_watched, watched_at)
         VALUES ($1,$2,$3, now() - ($4 || ' hours')::interval)`,
        [userId, item.id, 1200, i * 3 + index],
      );
    }
  }

  const { rows: reviewed } = await query(
    `SELECT id FROM content ORDER BY rating_value DESC NULLS LAST LIMIT 3`,
  );
  const comments = [
    'کیفیت تصویر و زیرنویس فارسی خیلی خوب بود.',
    'داستان جذابی داشت، تا آخر با هم دیدیم.',
    'برای شروع، انتخاب خوبی بود. امتیاز من ۸.',
  ];
  for (const [index, item] of reviewed.entries()) {
    await query(
      `INSERT INTO reviews (user_id, content_id, rating, comment) VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, content_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
      [userId, item.id, 8 - index, comments[index] ?? null],
    );
  }

  return accounts;
}

async function main() {
  const log = (message) => console.log(`[seed] ${message}`);
  log('applying migrations…');
  await runMigrations();

  log('seeding taxonomy…');
  await seedTaxonomy();

  log(`seeding ${titles.length} titles…`);
  await seedTitles();

  log('seeding homepage, plans and settings…');
  await seedPresentation();

  log('seeding demo accounts and activity…');
  const accounts = await seedDemoAccounts();

  log('done.');
  log(`admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  log(`user login:  ${USER_EMAIL} / ${USER_PASSWORD}`);
  log(`(${accounts.length} demo accounts — development only, documented in README)`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(`[seed] failed: ${error.message}`);
    await pool.end();
    process.exit(1);
  });
