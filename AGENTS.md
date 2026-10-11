# AGENTS.md — CineVerse dev environment notes

Non-obvious things worth knowing before changing this repo. Everything here is
about running and verifying the app in the Base44 sandbox; product docs live in
`README.md`.

## How the stack runs

`docker compose -f docker-compose.base44.yml up -d --build` brings up:

| service   | what it is                                   | notes |
|-----------|----------------------------------------------|-------|
| `db`      | Postgres 16 (infra image)                    | credentials live inline in the compose file |
| `migrate` | one-shot: `npm install` → migrations → seed  | everything else waits for it to exit 0 |
| `api`     | Express API, `node --watch`                  | port **8000 inside the network only** |
| `web`     | Vite dev server, host port **3000 → 5173**   | the public entry point |

The API is deliberately *not* published on a host port: the browser talks to
`/api/v1/...` and the Vite dev server proxies it to `http://api:8000`
(`VITE_API_PROXY_TARGET`). Same origin means session cookies work without CORS.

App services run from the bind-mounted source with live reload. Dependency
`node_modules` live in named volumes and are installed by the compose startup
commands — never install them on the sandbox host.

## Artwork in the sample data

`backend/src/db/artwork-data.js` maps every seeded title/person slug to its real
artwork path on the public TMDB image CDN; `seed.js` expands those into absolute
URLs (title poster `w500`, backdrop `w1280`, season poster `w500`, person `w300`).
The paths were resolved once with a throwaway script — never add runtime scraping
to the app. A slug with no entry seeds `NULL` and the UI shows its gradient
fallback, so a new title needs an entry here to get a poster. Re-running the seed
re-applies artwork because the upserts update `poster_url` / `photo_url`,
including season posters.

## Verifying the app works

1. `docker compose -f docker-compose.base44.yml ps` — `db`, `api` and `web` should be `healthy`.
2. `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` — expect `200`.
3. The preview is a client-rendered SPA; dev-server logs (`... logs web`) show
   live compilation and import errors. A `Pre-transform error: Failed to resolve
   import` line means a module referenced from `frontend/src/App.jsx` does not
   exist on disk — the page renders blank/erroring until it does.

There is no test suite; verification is done by exercising the app.

## Seeded development accounts (created by the seed step)

| email | password | role |
|-------|----------|------|
| `admin@cineverse.local` | `CineVerse!2024` | full admin |
| `support@cineverse.local` | `CineVerse!2024` | support (read-only panel) |
| `user@cineverse.local` | `CineVerse!2024` | ordinary user with an active subscription |

Override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_USER_*` if needed.

## Admin panel

* Every admin route is gated **server-side** (`requireAdmin`, and
  `requireStrictAdmin` for destructive calls such as delete/role change/settings
  writes). Hiding a button in the UI is not access control; keep the gate in the
  API when adding screens.
* `/admin` renders `AdminLayout` (sidebar shell) with the dashboard; the content
  list/editor, users, homepage and settings pages are siblings under
  `frontend/src/pages/admin/`.
* The admin API is **not shape-consistent**, which is easy to get wrong:
  * `GET /admin/content`, `/admin/content/:id`, `/admin/users`,
    `/admin/homepage-sections`, `/admin/banners` return **snake_case** rows
    (`title_fa`, `is_active`, `season_count`, …).
  * `GET /admin/stats` and `/admin/settings` return **camelCase** keys
    (`last_30_days_toman`, `brandNameFa`, …).
  * `POST /admin/banners` and `POST /admin/content` mark their optional text
    fields `.optional()` but **not** nullable — send the key omitted, not `null`,
    when the field is empty, or Zod rejects the payload with
    «اطلاعات ارسالی معتبر نیست». `PATCH` does accept `null` (used to clear a field).
* Homepage sections whose `source_type` is `custom` get their titles from
  `homepage_section_items`; the other source types are resolved dynamically in
  `backend/src/routes/home.js`.

## Sandbox-specific wiring

* `BASE44_PREVIEW_MODE` is passed through to `api` and `web` as a bare compose
  variable. It is never hardcoded and is only ever compared with `"1"`.
* Vite's allowed hosts come from `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`
  (platform-provided), so no host allowlist is hardcoded in `vite.config.js`.
* External secrets arrive via `/run/base44/app.env`, listed as the **last**
  `env_file:` so a dashboard value always wins. Non-secret development defaults
  live in `backend/.env.base44-defaults` (listed first). Never move a
  user-supplied key into compose `environment:`.
* `COOKIE_SECURE=1` in the defaults because the preview is served over HTTPS;
  set `COOKIE_SECURE=0` for plain-HTTP local development.
