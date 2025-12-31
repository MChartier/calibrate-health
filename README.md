# calibrate

Responsive calorie tracker (React + Vite frontend, Node/Express backend, Postgres + Prisma).

Official domain: calibratehealth.app

## Quickstart (devcontainer)

The devcontainer runs `npm run setup:devcontainer` automatically (installs deps, generates Prisma client, applies migrations).

1. Start the app: `npm run dev`
2. Frontend: `http://localhost:5173` (proxies `/auth` and `/api` to the backend)
3. Backend/API: `http://localhost:3000`

## Quickstart (local)

Prereqs: Node.js + npm, and a Postgres database.

1. Set env vars (recommended via `backend/.env`):
   - `DATABASE_URL=postgresql://user:password@localhost:5432/fitness_app?schema=public`
   - `SESSION_SECRET=some-secret`
   - `PORT=3000` (optional)
2. Install deps + generate Prisma client: `npm run setup`
3. Create tables (apply migrations): `npm run db:migrate`
4. Start the app: `npm run dev`

If you see Prisma errors like “The table `public.User` does not exist”, you haven’t applied migrations yet—run `npm run db:migrate`.

## Scripts

### Development

- `npm run dev`: runs backend + frontend together (`backend/` + `frontend/`).
- `npm run dev:backend`: runs only the backend (`http://localhost:3000`).
- `npm run dev:frontend`: runs only the frontend (`http://localhost:5173`).

### Setup

- `npm run setup`: installs deps in `backend/` and `frontend/` and runs `prisma generate` (does not modify the database).
- `npm run setup:devcontainer`: `setup` + `db:migrate` (used by the devcontainer).

### Database / Prisma

- `npm run prisma:generate`: regenerates the Prisma client (use after changing `backend/prisma/schema.prisma`).
- `npm run db:migrate`: runs `prisma migrate deploy` to apply committed migrations (use for fresh DBs, CI, and prod).
- `npm run db:migrate:dev`: runs `prisma migrate dev` to create/apply migrations during local development (use when you changed the schema and need a new migration).
- `npm run db:reset`: runs `prisma migrate reset` (destructive; drops data and recreates the schema).
- `npm run db:studio`: runs `prisma studio` (Prisma’s DB browser).

### Frontend build / lint

- `npm run build`: builds the frontend.
- `npm run lint`: lints the frontend.

## PWA (installable)

The frontend is configured as a Progressive Web App (PWA), so it can be installed on desktop/mobile and added to a home screen.

- Test locally: `npm --prefix frontend run build && npm --prefix frontend run preview` then open `http://localhost:4173` and use the browser install UI.
- iOS: open the app in Safari and use Share -> Add to Home Screen.

### Tests

- `npm test`: runs backend unit tests (Node.js test runner).
- `npm run test:coverage`: runs tests + prints a coverage summary (line + branch coverage) and writes an HTML report to `backend/coverage/index.html`.

## Docker compose (optional)

`docker compose up --build` starts `postgres`, `backend`, and `frontend`.

On first run you still need to apply migrations once:

`docker compose exec backend npm run db:migrate`

## Production / staging (single origin)

Production is hosted at `https://calibratehealth.app` and staging is hosted at `https://staging.calibratehealth.app`.

This app is configured for a "single origin" deployment where the frontend and backend share the same host. In that
setup you do not need CORS, and cookies should remain host-scoped.

Recommended backend env vars:

- `NODE_ENV=production` (or `staging` for staging)
- `DATABASE_URL=...`
- `SESSION_SECRET=...` (use a different value for staging vs prod)

Notes:

- Leave `CORS_ORIGINS` unset for single-origin prod/staging deployments.
- Leave `SESSION_COOKIE_DOMAIN` unset so prod and staging sessions do not collide in the same browser.
- `SESSION_COOKIE_SECURE` defaults to `true` in production-like envs (production + staging); override only if you are intentionally serving over plain HTTP.
