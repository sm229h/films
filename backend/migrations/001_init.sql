-- CineVerse — initial schema
-- Design goals: real relations, FK integrity, indexes for the query patterns the
-- API actually uses, timestamps everywhere, and no speculative tables.
--
-- Note on `content`: movies and series share ~95% of their attributes, so they
-- live in one table discriminated by `kind`. This avoids a polymorphic FK on
-- every dependent table (favorites, watch progress, reviews, genres, people,
-- video sources) while still exposing separate /movies and /series endpoints.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- helpers ---
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------- enums ---
CREATE TYPE content_kind    AS ENUM ('movie', 'series');
CREATE TYPE publish_status  AS ENUM ('draft', 'published');
CREATE TYPE access_tier     AS ENUM ('free', 'premium');
CREATE TYPE user_role       AS ENUM ('user', 'support', 'admin');
CREATE TYPE source_kind     AS ENUM ('hls', 'mp4');
CREATE TYPE person_role     AS ENUM ('director', 'actor', 'writer');
CREATE TYPE review_status   AS ENUM ('pending', 'published', 'rejected');
CREATE TYPE sub_status      AS ENUM ('active', 'expired', 'canceled');
CREATE TYPE payment_status  AS ENUM ('pending', 'paid', 'failed', 'canceled');

-- ------------------------------------------------------------------- users ---
CREATE TABLE users (
  id             bigserial PRIMARY KEY,
  email          citext NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  full_name      text,
  role           user_role NOT NULL DEFAULT 'user',
  is_blocked     boolean NOT NULL DEFAULT false,
  blocked_reason text,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Server-side session registry: a JWT is only honoured while its `jti` row
-- exists here, which makes logout / revocation / blocking real.
CREATE TABLE user_sessions (
  id           bigserial PRIMARY KEY,
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti          uuid NOT NULL UNIQUE,
  user_agent   text,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX user_sessions_user_idx ON user_sessions (user_id);
CREATE INDEX user_sessions_expires_idx ON user_sessions (expires_at);

CREATE TABLE password_resets (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_token_idx ON password_resets (token_hash);

-- ----------------------------------------------------------------- catalog ---
CREATE TABLE countries (
  id        bigserial PRIMARY KEY,
  code      char(2) NOT NULL UNIQUE,
  name_fa   text NOT NULL,
  name_en   text NOT NULL
);

CREATE TABLE genres (
  id          bigserial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name_fa     text NOT NULL,
  name_en     text NOT NULL,
  sort_order  int NOT NULL DEFAULT 100
);

CREATE TABLE people (
  id          bigserial PRIMARY KEY,
  slug        text NOT NULL UNIQUE,
  name_fa     text,
  name_en     text NOT NULL,
  photo_url   text,
  birth_year  int,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX people_name_en_trgm_idx ON people USING gin (name_en gin_trgm_ops);

CREATE TABLE content (
  id                bigserial PRIMARY KEY,
  kind              content_kind NOT NULL,
  slug              text NOT NULL UNIQUE,
  title_fa          text NOT NULL,
  title_en          text NOT NULL,
  synopsis_short    text,
  synopsis_full     text,
  release_year      int,
  end_year          int,
  runtime_minutes   int,          -- movies only
  age_rating        text,
  rating_source     text,
  rating_value      numeric(3,1), -- e.g. 8.8
  rating_votes      int,
  quality           text,         -- 720p / 1080p / 4K
  country_id        bigint REFERENCES countries(id) ON DELETE SET NULL,
  original_language text,
  poster_url        text,
  backdrop_url      text,
  trailer_url       text,
  has_awards        boolean NOT NULL DEFAULT false,
  is_featured       boolean NOT NULL DEFAULT false,
  featured_rank     int,
  status            publish_status NOT NULL DEFAULT 'published',
  access            access_tier NOT NULL DEFAULT 'premium',
  released_at       date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_movie_runtime CHECK (
    (kind = 'movie' AND runtime_minutes IS NOT NULL) OR kind = 'series'
  )
);
CREATE TRIGGER content_updated_at BEFORE UPDATE ON content
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX content_kind_status_idx ON content (kind, status);
CREATE INDEX content_release_year_idx ON content (release_year DESC);
CREATE INDEX content_rating_idx ON content (rating_value DESC NULLS LAST);
CREATE INDEX content_featured_idx ON content (is_featured, featured_rank);
-- ZWNJ-insensitive (نیم‌فاصله) fuzzy search on Persian and English titles.
CREATE INDEX content_title_fa_trgm_idx
  ON content USING gin ((regexp_replace(title_fa, chr(8204), '', 'g')) gin_trgm_ops);
CREATE INDEX content_title_en_trgm_idx
  ON content USING gin (lower(title_en) gin_trgm_ops);

CREATE TABLE content_genres (
  content_id bigint NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  genre_id   bigint NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (content_id, genre_id)
);
CREATE INDEX content_genres_genre_idx ON content_genres (genre_id);

CREATE TABLE content_people (
  content_id     bigint NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  person_id      bigint NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role           person_role NOT NULL,
  character_name text,
  sort_order     int NOT NULL DEFAULT 100,
  PRIMARY KEY (content_id, person_id, role)
);
CREATE INDEX content_people_person_idx ON content_people (person_id);

CREATE TABLE seasons (
  id             bigserial PRIMARY KEY,
  content_id     bigint NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  season_number  int NOT NULL,
  title_fa       text,
  synopsis       text,
  poster_url     text,
  air_year       int,
  episode_count  int,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_id, season_number)
);
CREATE TRIGGER seasons_updated_at BEFORE UPDATE ON seasons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE episodes (
  id               bigserial PRIMARY KEY,
  season_id        bigint NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  episode_number   int NOT NULL,
  title_fa         text NOT NULL,
  title_en         text,
  synopsis         text,
  runtime_minutes  int,
  air_date         date,
  still_url        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, episode_number)
);
CREATE TRIGGER episodes_updated_at BEFORE UPDATE ON episodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Playable streams. Exactly one of content_id / episode_id is set.
CREATE TABLE video_sources (
  id               bigserial PRIMARY KEY,
  content_id       bigint REFERENCES content(id) ON DELETE CASCADE,
  episode_id       bigint REFERENCES episodes(id) ON DELETE CASCADE,
  label            text NOT NULL,
  quality          text,
  source_kind      source_kind NOT NULL DEFAULT 'hls',
  url              text NOT NULL,
  is_default       boolean NOT NULL DEFAULT false,
  requires_premium boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT video_sources_owner CHECK (
    (content_id IS NOT NULL) <> (episode_id IS NOT NULL)
  )
);
CREATE INDEX video_sources_content_idx ON video_sources (content_id);
CREATE INDEX video_sources_episode_idx ON video_sources (episode_id);

CREATE TABLE subtitles (
  id              bigserial PRIMARY KEY,
  video_source_id bigint NOT NULL REFERENCES video_sources(id) ON DELETE CASCADE,
  language_code   text NOT NULL,
  label           text NOT NULL,
  url             text NOT NULL,
  is_default      boolean NOT NULL DEFAULT false,
  UNIQUE (video_source_id, language_code)
);

CREATE TABLE audio_tracks (
  id              bigserial PRIMARY KEY,
  video_source_id bigint NOT NULL REFERENCES video_sources(id) ON DELETE CASCADE,
  language_code   text NOT NULL,
  label           text NOT NULL,
  url             text,
  is_default      boolean NOT NULL DEFAULT false,
  UNIQUE (video_source_id, language_code)
);

-- ------------------------------------------------------------ user activity --
CREATE TABLE favorites (
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id  bigint NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_id)
);
CREATE INDEX favorites_content_idx ON favorites (content_id);

CREATE TABLE watch_progress (
  id                bigserial PRIMARY KEY,
  user_id           bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id        bigint NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  episode_id        bigint REFERENCES episodes(id) ON DELETE CASCADE,
  position_seconds  int NOT NULL DEFAULT 0,
  duration_seconds  int,
  completed         boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, content_id, episode_id)
);
CREATE INDEX watch_progress_user_idx ON watch_progress (user_id, updated_at DESC);

CREATE TABLE watch_history (
  id                bigserial PRIMARY KEY,
  user_id           bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id        bigint NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  episode_id        bigint REFERENCES episodes(id) ON DELETE SET NULL,
  seconds_watched   int NOT NULL DEFAULT 0,
  watched_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX watch_history_user_idx ON watch_history (user_id, watched_at DESC);

CREATE TABLE reviews (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_id  bigint NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 10),
  comment     text,
  status      review_status NOT NULL DEFAULT 'published',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, content_id)
);
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX reviews_content_idx ON reviews (content_id, status);

-- ---------------------------------------------------------------- commerce ---
CREATE TABLE subscription_plans (
  id             bigserial PRIMARY KEY,
  code           text NOT NULL UNIQUE,
  name_fa        text NOT NULL,
  description    text,
  price_toman    int NOT NULL CHECK (price_toman >= 0),
  duration_days  int NOT NULL CHECK (duration_days > 0),
  features       jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     int NOT NULL DEFAULT 100,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER subscription_plans_updated_at BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_subscriptions (
  id          bigserial PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id     bigint NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status      sub_status NOT NULL DEFAULT 'active',
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz NOT NULL,
  canceled_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_subscriptions_user_idx ON user_subscriptions (user_id, ends_at DESC);

CREATE TABLE payments (
  id               bigserial PRIMARY KEY,
  user_id          bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id  bigint REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  plan_id          bigint REFERENCES subscription_plans(id) ON DELETE SET NULL,
  amount_toman     int NOT NULL,
  status           payment_status NOT NULL DEFAULT 'pending',
  provider         text NOT NULL DEFAULT 'sandbox',
  provider_ref     text,
  authority        text UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  paid_at          timestamptz
);
CREATE INDEX payments_user_idx ON payments (user_id, created_at DESC);

-- ------------------------------------------------------------- presentation --
CREATE TABLE banners (
  id         bigserial PRIMARY KEY,
  title_fa   text NOT NULL,
  subtitle   text,
  image_url  text,
  link_url   text,
  placement  text NOT NULL DEFAULT 'home',
  is_active  boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER banners_updated_at BEFORE UPDATE ON banners
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE homepage_sections (
  id            bigserial PRIMARY KEY,
  key           text NOT NULL UNIQUE,
  title_fa      text NOT NULL,
  subtitle      text,
  layout        text NOT NULL DEFAULT 'row' CHECK (layout IN ('row', 'grid', 'hero')),
  source_type   text NOT NULL CHECK (source_type IN
                  ('trending', 'popular', 'top_rated', 'new', 'awards',
                   'continue_watching', 'genre', 'custom')),
  source_value  text,
  max_items     int NOT NULL DEFAULT 18,
  is_active     boolean NOT NULL DEFAULT true,
  sort_order    int NOT NULL DEFAULT 100,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER homepage_sections_updated_at BEFORE UPDATE ON homepage_sections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE homepage_section_items (
  id          bigserial PRIMARY KEY,
  section_id  bigint NOT NULL REFERENCES homepage_sections(id) ON DELETE CASCADE,
  content_id  bigint NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  sort_order  int NOT NULL DEFAULT 100,
  UNIQUE (section_id, content_id)
);

CREATE TABLE site_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id          bigserial PRIMARY KEY,
  user_id     bigint REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text,
  entity_id   text,
  meta        jsonb,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
