# calibrate

calibrate is a responsive calorie tracker (desktop + mobile web) for people who want to lose (or maintain) weight by
logging food and weight, then comparing daily intake against an estimated target based on their profile.
If you self-host, your data stays in your own database.

- Hosted instance: https://calibratehealth.app
- Stack: React + TypeScript + Vite (MUI), Node.js + TypeScript + Express, Postgres (Prisma)
- Installable PWA: add it to your home screen / desktop like an app

Note: calibrate is not medical advice.

## Features

- Multi-user accounts (email/password)
- Profile-driven calorie math (Mifflin-St Jeor BMR, activity-based TDEE, fixed daily deficit targets)
- Daily food logging with fixed meal categories (manual entry + food database search)
- Food search + barcode scanning (FatSecret default; USDA optional with API key; Open Food Facts fallback)
- My Foods library + recipe builder for reusable entries
- Lose It CSV import (food logs + weigh-ins)
- Weight logging + trend visualization
- Goal projection from a steady deficit

#### FatSecret terms + attribution

If you enable the FatSecret provider, you must comply with the FatSecret Platform API Terms of Use and Attribution Policy.
The app includes the required "Powered by fatsecret" link on the landing page and above food search results when
FatSecret is the active provider; keep that link intact. Review the FatSecret platform docs for the latest terms and
attribution requirements: https://platform.fatsecret.com/docs/guides

## Docs

- Deployment (Compose self-hosting): `deploy/README.md`
- AWS infra (ECS Fargate): `infra/README.md`
- Frontend dev/build/PWA: `frontend/README.md`

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

4. Optional: apply DB migrations explicitly (first deploy, or after pulling changes with new migrations). The production
   image runs `npm run db:migrate` on startup, but running it manually lets you control timing:

   ```sh
   docker compose exec app npm run db:migrate
   ```

Notes:

- Caddy needs ports 80/443 reachable from the internet (and DNS pointing at the machine) to get HTTPS certificates.
- This stack expects you to provide a Postgres database (managed or self-hosted).
- If you want Postgres in Docker on the same machine, add a Postgres service to `deploy/docker-compose.yml`
  (see the repo root `docker-compose.yml` for a dev example).

See [deploy/README.md](deploy/README.md) for required env vars, staging options, and notes.

### Option B: AWS (Terraform)

The `infra/` folder contains the Terraform + GitHub Actions workflow used to deploy `calibratehealth.app`
(ECS Fargate + ALB, RDS Postgres, Route 53, and deploys via GitHub Actions).
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
`npm --prefix backend run db:push:reset` and `npm --prefix backend run db:seed`.

This repo supports a repo-local `.env` file (gitignored) for devcontainer secrets. Start by copying `.env.example` to
`.env`, then rebuild the devcontainer so `.devcontainer/.env` is regenerated and Docker can pass the values into the
container.

Devcontainer CLI helpers (worktree-friendly, safe to run from any worktree):

- Start or reuse a container: `npm run devcontainer:up -- <branch|path>`
- Start a fresh container: `npm run devcontainer:up:new -- <branch|path>`
- Open a shell in the workspace: `npm run devcontainer:shell -- <branch|path>`
- Recreate then shell: `npm run devcontainer:shell:new -- <branch|path>`

If you omit `<branch|path>`, the current directory is used. You can pass a worktree branch name (e.g. `alpha`, `beta`)
or a path. For example: `npm run devcontainer:shell -- alpha` or
`npm run devcontainer:shell -- --path /home/matthew/code/calibrate-health-alpha`.

1. Start the app: `npm run dev`
2. Frontend: `http://localhost:5173` (proxies `/auth` and `/api` to the backend)
3. Backend/API: `http://localhost:3000`
4. Dev dashboard (dev-only): `http://localhost:5173/dev` (compare providers + test barcode scanning)

#### FatSecret provider (devcontainer)

The backend supports multiple food search providers. The devcontainer defaults to the FatSecret provider
(`FOOD_DATA_PROVIDER=fatsecret`).

To make this work, you must have `FATSECRET_CLIENT_ID` and `FATSECRET_CLIENT_SECRET` set (either in the host environment
or in the repo-local `.env`) before the devcontainer is created/rebuilt. During devcontainer initialization we copy the
credentials into `.devcontainer/.env` (gitignored), and `docker compose` uses them to pass the values into the container.

Example (host machine):

```sh
export FATSECRET_CLIENT_ID="your-client-id"
export FATSECRET_CLIENT_SECRET="your-client-secret"
```

If you add/change the credentials, rebuild the devcontainer so the generated `.devcontainer/.env` is refreshed.

To use USDA instead, set `FOOD_DATA_PROVIDER=usda` and supply `USDA_API_KEY` before rebuilding the devcontainer.

#### Codex CLI auth (devcontainer)

If you want Codex pre-authenticated in the container, set a Codex API key before the devcontainer is created/rebuilt.
Prefer `CALIBRATE_CODEX_API_KEY` (host env or repo-local `.env`); `CODEX_API_KEY` and `OPENAI_API_KEY` are also accepted.

Example (host machine):

```sh
export CALIBRATE_CODEX_API_KEY="your-codex-key"
```

#### GitHub CLI auth (devcontainer)

To let Codex (and you) run non-interactive GitHub operations like pushing branches and creating PRs, set a fine-grained
PAT before the devcontainer is created/rebuilt. Prefer the repo-specific name `CALIBRATE_GH_PAT` (host env or repo-local
`.env`). We also accept `GH_AUTH_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN` if you already use those names.

Example (host machine):

```sh
export CALIBRATE_GH_PAT="ghp_your_token_here"
```

During devcontainer init, the token is translated to `GH_AUTH_TOKEN` (and `GH_TOKEN`/`GITHUB_TOKEN`) for the container.
The devcontainer installs `gh`, passes the token into the container, and configures:

- `gh` to use the token without prompting.
- `git push` to use an HTTPS *push* URL for `origin` (fetch stays as-is) with credentials supplied by `gh`.

#### Dev test user (optional)

The seed script creates a deterministic local test account (`test@calibratehealth.app`). To speed up onboarding
iterations you can auto-login this user and reset its onboarding state:

- Start with auto-login enabled: `npm run dev:test` (sets `AUTO_LOGIN_TEST_USER=true`)
- Reset the test user onboarding state: `npm run dev:reset-test-user-onboarding`

### Quickstart (local)

Prereqs: Node.js + npm, and a Postgres database.

1. Set env vars (recommended via `backend/.env`):
   - `DATABASE_URL=postgresql://user:password@localhost:5432/fitness_app?schema=public`
   - `SESSION_SECRET=some-secret`
   - `PORT=3000` (optional)
   - `FOOD_DATA_PROVIDER=fatsecret` (optional; defaults to FatSecret)
   - `FATSECRET_CLIENT_ID=your-client-id` (required when `FOOD_DATA_PROVIDER=fatsecret`)
   - `FATSECRET_CLIENT_SECRET=your-client-secret` (required when `FOOD_DATA_PROVIDER=fatsecret`)
   - `USDA_API_KEY=your-usda-key` (required when `FOOD_DATA_PROVIDER=usda`)
2. Install deps + generate Prisma client: `npm run setup`
3. Create tables (apply migrations): `npm run db:migrate`
4. Start the app: `npm run dev`

If you see Prisma errors like "The table `public.User` does not exist", you haven't applied migrations yet - run
`npm run db:migrate`.

### Common scripts

- `npm run dev`: runs backend + frontend together (`backend/` + `frontend/`).
- `npm run dev:test`: same as `npm run dev`, but auto-logs in the seeded dev user.
- `npm run dev:reset-test-user-onboarding`: reset the dev test user to pre-onboarding.
- `npm run dev:backend`: runs only the backend (`http://localhost:3000`).
- `npm run dev:frontend`: runs only the frontend (`http://localhost:5173`).
- `npm run setup`: installs deps in `backend/` and `frontend/` and runs `prisma generate` (does not modify the DB).
- `npm run db:migrate`: applies committed migrations (use for fresh DBs, CI, and prod).
- `npm test`: runs backend unit tests (Node.js test runner).

More:

- `npm run db:migrate:dev`: create/apply new migrations during local development.
- `npm run db:reset`: destructive reset (drops data and recreates schema).
- `npm run db:seed`: seed deterministic dev data (test user + sample logs).
- `npm --prefix backend run db:push:reset`: dev-only schema reset using `prisma db push` (fast, skips migrations).
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
- `FRONTEND_DIST_DIR=...` when the backend should serve the built SPA (the production Docker image sets this already)

Notes:

- Leave `CORS_ORIGINS` unset for single-origin prod/staging deployments.
- Leave `SESSION_COOKIE_DOMAIN` unset so prod and staging sessions do not collide in the same browser.
- Keep `SESSION_SECRET` stable within an environment so sessions remain valid across deploys.
- `SESSION_COOKIE_SECURE` defaults to `true` in production and staging; override only if you are intentionally serving over plain HTTP.
