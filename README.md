# calibrate

Responsive calorie tracker (React + Vite frontend, Node/Express backend, Postgres + Prisma).

Official domain: calibratehealth.app

## Quickstart (devcontainer)

The devcontainer runs `npm run setup` automatically (installs deps + generates the Prisma client). On start it also runs `npm run db:migrate` and `npm run db:seed`.

1. Start the app: `npm run dev`
2. Frontend: `http://localhost:5173` (proxies `/auth` and `/api` to the backend)
3. Backend/API: `http://localhost:3000`
4. Dev dashboard (dev-only): `http://localhost:5173/dev` (compare providers + test barcode scanning)

### USDA FoodData Central provider (devcontainer)

The backend supports multiple food search providers. The devcontainer is configured to use the USDA FoodData Central provider (`FOOD_DATA_PROVIDER=usda`).

To make this work, you must have `USDA_API_KEY` set in your *host* environment before the devcontainer is created/rebuilt. During devcontainer initialization we copy `USDA_API_KEY` into `.devcontainer/.env` (gitignored), and `docker compose` uses it to pass the key into the container.

Example (host machine):

```sh
export USDA_API_KEY="your-usda-key"
```

If you add/change the key, rebuild the devcontainer so the generated `.devcontainer/.env` is refreshed.

## Quickstart (local)

Prereqs: Node.js + npm, and a Postgres database.

1. Set env vars (recommended via `backend/.env`):
   - `DATABASE_URL=postgresql://user:password@localhost:5432/fitness_app?schema=public`
   - `SESSION_SECRET=some-secret`
   - `PORT=3000` (optional)
   - `FOOD_DATA_PROVIDER=usda` (optional; defaults to Open Food Facts)
   - `USDA_API_KEY=your-usda-key` (required when `FOOD_DATA_PROVIDER=usda`)
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
- Devcontainer note: the devcontainer runs `npm run setup` on create, and `npm run db:migrate && npm run db:seed` on start.

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
