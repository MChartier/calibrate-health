# calibrate

calibrate is a responsive calorie tracker (desktop + mobile web) for people who want to lose (or maintain) weight by
logging food and weight, then comparing daily intake against an estimated target based on their profile.
If you self-host, your data stays in your own database.

- Hosted instance: https://calibratehealth.app
- Stack: React + TypeScript + Vite (MUI), Node.js + TypeScript + Express, Postgres (Prisma)
- Installable PWA: add it to your home screen / desktop like an app

Note: calibrate is not medical advice.

## Features (MVP)

- Multi-user accounts (email/password)
- Profile-driven calorie math (Mifflin-St Jeor BMR, activity-based TDEE, fixed daily deficit targets)
- Daily food logging with fixed meal categories
- Weight logging + trend visualization
- Goal projection from a steady deficit

## Self-hosting

Two supported paths:

### Option A: Docker Compose (single machine)

For a production-oriented Compose stack (Caddy for HTTPS + reverse proxy, plus the app container), use the files in
`deploy/`.

Quick start:

1. Build the production image:

   ```sh
   docker build -f Dockerfile.app -t calibrate:local .
   ```

2. Create `deploy/Caddyfile` and `deploy/.env`:

   - Start from a template Caddyfile:
     - `deploy/Caddyfile.prod` (production)
     - `deploy/Caddyfile.staging` (basic auth, handy for private/staging installs)
   - Copy it to `deploy/Caddyfile` and edit the site address (replace `calibratehealth.app` with your domain).
   - Create a `.env` file with your image + database + session secret:

     ```dotenv
     APP_IMAGE=calibrate:local
     DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public
     # Generate with: openssl rand -base64 32
     SESSION_SECRET=replace-with-random
     # Optional (recommended): CADDY_EMAIL=you@example.com
     ```

3. Start the stack:

   ```sh
   cd deploy
   docker compose up -d
   ```

4. Apply DB migrations once (first deploy, or after pulling changes with new migrations):

   ```sh
   docker compose exec app npm run db:migrate
   ```

Notes:

- Caddy needs ports 80/443 reachable from the internet (and DNS pointing at the machine) to get HTTPS certificates.
- This stack expects you to provide a Postgres database (managed or self-hosted).
- If you want Postgres in Docker on the same machine, use a managed DB or adapt the Postgres service in
  `docker-compose.yml`.

See [deploy/README.md](deploy/README.md) for required env vars, staging options, and notes.

### Option B: AWS (Terraform)

The `infra/` folder contains the Terraform + GitHub Actions workflow used to deploy `calibratehealth.app`
(EC2 running Docker Compose, RDS Postgres, Route 53, and deploys via SSM).
It is a good starting point for deploying to your own AWS account, but it is opinionated and you'll likely want to
customize names/domains to match your setup.

High-level steps:

1. Install prereqs: Terraform + AWS CLI (and an AWS account to deploy into).
2. Run `terraform apply` in `infra/bootstrap` once to create shared resources (state, IAM/OIDC, ECR, Route 53).
3. Run `terraform apply` in `infra/envs/staging` and/or `infra/envs/prod` to create the app environment(s).
4. Populate the required Secrets Manager JSON and configure the GitHub Actions secrets for CI/CD.

Full guide (including required secrets and exact commands): [infra/README.md](infra/README.md)

## Development

### Quickstart (devcontainer)

The devcontainer runs `npm run setup` automatically (installs deps + generates the Prisma client). On start it also runs
`npm run db:migrate` and `npm run db:seed`.

1. Start the app: `npm run dev`
2. Frontend: `http://localhost:5173` (proxies `/auth` and `/api` to the backend)
3. Backend/API: `http://localhost:3000`
4. Dev dashboard (dev-only): `http://localhost:5173/dev` (compare providers + test barcode scanning)

#### USDA FoodData Central provider (devcontainer)

The backend supports multiple food search providers. The devcontainer is configured to use the USDA FoodData Central
provider (`FOOD_DATA_PROVIDER=usda`).

To make this work, you must have `USDA_API_KEY` set in your host environment before the devcontainer is created/rebuilt.
During devcontainer initialization we copy `USDA_API_KEY` into `.devcontainer/.env` (gitignored), and `docker compose`
uses it to pass the key into the container.

Example (host machine):

```sh
export USDA_API_KEY="your-usda-key"
```

If you add/change the key, rebuild the devcontainer so the generated `.devcontainer/.env` is refreshed.

### Quickstart (local)

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

If you see Prisma errors like "The table `public.User` does not exist", you haven't applied migrations yet - run
`npm run db:migrate`.

### Common scripts

- `npm run dev`: runs backend + frontend together (`backend/` + `frontend/`).
- `npm run dev:backend`: runs only the backend (`http://localhost:3000`).
- `npm run dev:frontend`: runs only the frontend (`http://localhost:5173`).
- `npm run setup`: installs deps in `backend/` and `frontend/` and runs `prisma generate` (does not modify the DB).
- `npm run db:migrate`: applies committed migrations (use for fresh DBs, CI, and prod).
- `npm test`: runs backend unit tests (Node.js test runner).

More:

- `npm run db:migrate:dev`: create/apply new migrations during local development.
- `npm run db:reset`: destructive reset (drops data and recreates schema).
- `npm run db:studio`: Prisma Studio (DB browser).
- `npm run build`: build the frontend.
- `npm run lint`: lint the frontend.
- `npm run test:coverage`: print coverage + write `backend/coverage/index.html`.

### Docker Compose (dev stack)

The repo root `docker-compose.yml` is a development stack that starts `postgres`, `backend`, and `frontend` with live
reload and dev-only defaults.

```sh
docker compose up --build
```

## PWA (installable)

The frontend is configured as a Progressive Web App (PWA), so it can be installed on desktop/mobile and added to a home
screen.

- Test locally: `npm --prefix frontend run build && npm --prefix frontend run preview` then open
  `http://localhost:4173` and use the browser install UI.
- iOS: open the app in Safari and use Share -> Add to Home Screen.

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
- Keep `SESSION_SECRET` stable within an environment so sessions remain valid across deploys.
- `SESSION_COOKIE_SECURE` defaults to `true` in production and staging; override only if you are intentionally serving over plain HTTP.
