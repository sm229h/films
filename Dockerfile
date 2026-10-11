# CineVerse — production single-service image.
# Builds the frontend (Vite) and serves it through the Express API,
# so one container/port hosts both UI and /api/v1.
#
# Build:  docker build -t cineverse .
# Run:    docker run -p 8000:8000 --env-file .env cineverse
# Required env: DATABASE_URL, JWT_SECRET (min 16 chars).
# For HTTPS behind a proxy: COOKIE_SECURE=1, TRUST_PROXY=1.

FROM node:22-bookworm-slim AS web-build
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# VITE_API_BASE_URL is intentionally left empty: same-origin mode.
RUN npm run build

FROM node:22-bookworm-slim AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY backend/ ./
# Frontend build is served by the API (see src/app.js resolveFrontendDir).
COPY --from=web-build /web/dist ./public/app
EXPOSE 8000
CMD ["sh", "-ec", "node src/db/migrate.js; exec node src/server.js"]
