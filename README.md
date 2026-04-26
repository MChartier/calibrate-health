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

- Weight trend model: `docs/weight-trend-model.md`
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

The devcontainer starts quickly and does not install app dependencies or reset the database automatically. Run
`npm run setup` inside the container when you need the full app environment; it installs dependencies, generates the
Prisma client, applies migrations, and seeds deterministic dev data.

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

#### Codex app worktrees

Codex app local environments are defined under `.codex/environments/`. The `local-devcontainer` environment calls the
tracked setup script at `.codex/local-environment.setup.mjs`:

```sh
node .codex/local-environment.setup.mjs
```

The script targets `CODEX_WORKTREE_PATH` when the Codex app provides it, installs the repo-local Dev Containers CLI if
needed into a host-level tool cache, copies the source checkout's ignored `.env` into the new worktree when needed, and
starts that worktree's devcontainer with isolated Compose services and ports. It intentionally does not install app
dependencies, run devcontainer post-create hooks, migrate the database, or seed data; those steps are exposed as Codex
actions.
For Codex-managed worktrees whose folder is still named `calibrate-health`, the devcontainer identity is derived from
the full worktree path so concurrent app-created worktrees do not share a Compose project, database volume, or dev ports.
Backend and frontend `node_modules` are mounted as shared lockfile-hashed Docker volumes, so sibling worktrees with the
same lockfiles can reuse installed dependencies without writing them into the Windows bind mount.

Recommended Codex app actions:

- Setup: `npm run codex:setup-app`
- Recreate Devcontainer: `npm run codex:devcontainer:recreate`
- Stop Devcontainer: `npm run codex:devcontainer:down`
- Migrate DB: `npm run codex:db:migrate`
- Reset DB: `npm run codex:db:reset`
- Dev server with test-user auto-login: `npm run codex:dev`
- Storybook component workbench: `npm run codex:storybook`
- Test: `npm run codex:test`
- Full CI: `npm run codex:ci`
- Shell: `npm run codex:shell`

The Dev action runs the same setup checks as Setup first, but cached dependencies, already-applied migrations, and
existing seed data are skipped. After the preflight passes, it starts `npm run dev:test`.
Use Recreate Devcontainer after changing devcontainer config or when the worktree's container state needs a clean
replacement. It tears down the generated Compose stack for the current worktree before starting a fresh container.
Use Stop Devcontainer to remove the current worktree's generated devcontainer stack during cleanup.

When using VS Code with a Codex-created worktree container, use **Dev Containers: Attach to Running Container** and open
`/workspaces/calibrate-health` inside the container. **Reopen in Container** follows VS Code's own devcontainer flow and
may create or recreate a separate container.

1. Start the app: `npm run dev`
2. Frontend: `http://localhost:5173` (proxies `/auth` and `/api` to the backend)
3. Backend/API: `http://localhost:3000`
4. Dev dashboard (dev-only): `http://localhost:5173/dev` (compare providers + test barcode scanning)
5. Component workbench: `npm run dev:storybook` (local Storybook defaults to `http://localhost:6006`; devcontainer worktrees use the generated `STORYBOOK_PORT` in `.devcontainer/.env`)

#### Food data provider (devcontainer)

The backend supports multiple food search providers. During devcontainer initialization, the repo writes
`FOOD_DATA_PROVIDER` into `.devcontainer/.env` from explicit config first, then from available credentials:
FatSecret when both FatSecret credentials are set, USDA when `USDA_API_KEY` is set, and USDA with api.data.gov's
public `DEMO_KEY` when no provider credentials are available. This keeps local search usable when Open Food Facts
anonymous access is throttled.

To use FatSecret, set `FOOD_DATA_PROVIDER=fatsecret` with `FATSECRET_CLIENT_ID` and `FATSECRET_CLIENT_SECRET` (either in
the host environment or in the repo-local `.env`) before the devcontainer is created/rebuilt. During devcontainer
initialization we copy the provider config into `.devcontainer/.env` (gitignored), and `docker compose` uses it to pass
the values into the container.

Example (host machine):

```sh
export FATSECRET_CLIENT_ID="your-client-id"
export FATSECRET_CLIENT_SECRET="your-client-secret"
```

If you add/change the credentials, rebuild the devcontainer so the generated `.devcontainer/.env` is refreshed.

To use USDA with your own quota, set `FOOD_DATA_PROVIDER=usda` and supply `USDA_API_KEY` before rebuilding the
devcontainer. To test Open Food Facts specifically, set `FOOD_DATA_PROVIDER=openfoodfacts`; that path depends on the
public Open Food Facts API allowing anonymous requests.

#### Codex app usage

The Codex app runs outside the devcontainer and uses the repo-local actions above to execute commands inside it.
The devcontainer does not install or configure the Codex CLI by default, which keeps new worktree startup focused on
creating the app container quickly.

#### Dev test user (optional)

The seed script creates a deterministic local test account (`test@calibratehealth.app`). To speed up onboarding
iterations you can auto-login this user and reset its onboarding state:

- Start with auto-login enabled: `npm run dev:test` (sets `AUTO_LOGIN_TEST_USER=true`)
- Reset the test user onboarding state: `npm run dev:reset-test-user-onboarding`

### Quickstart (local)

Prereqs: Node.js `20.19+` or `22.12+`, npm, and a Postgres database.

1. Set env vars (recommended via `backend/.env`):
   - `DATABASE_URL=postgresql://user:password@localhost:5432/fitness_app?schema=public`
   - `SESSION_SECRET=some-secret`
   - `PORT=3000` (optional)
   - `FOOD_DATA_PROVIDER=fatsecret` (optional; defaults by available credentials in the devcontainer)
   - `FATSECRET_CLIENT_ID=your-client-id` (required when `FOOD_DATA_PROVIDER=fatsecret`)
   - `FATSECRET_CLIENT_SECRET=your-client-secret` (required when `FOOD_DATA_PROVIDER=fatsecret`)
   - `USDA_API_KEY=your-usda-key` (required when `FOOD_DATA_PROVIDER=usda`)
2. Install deps + generate Prisma client: `npm run setup`
3. Create tables (apply migrations): `npm run db:migrate`
4. Start the app: `npm run dev`

If you see Prisma errors like "The table `public.User` does not exist", you haven't applied migrations yet - run
`npm run db:migrate`.

### Common scripts

- `npm run dev`: runs backend + frontend together (`backend/` + `frontend/`) with `VITE_ENABLE_SW_DEV=1` for local PWA/push validation.
- `npm run dev:test`: same as `npm run dev`, but auto-logs in the seeded dev user.
- `npm run dev:reset-test-user-onboarding`: reset the dev test user to pre-onboarding.
- `npm run dev:backend`: runs only the backend (`http://localhost:3000`).
- `npm run dev:frontend`: runs only the frontend (`http://localhost:5173`).
- `npm run dev:storybook`: runs Storybook for isolated React component development. Local runs default to `http://localhost:6006`; devcontainer worktrees use the generated `STORYBOOK_PORT` so concurrent worktrees do not collide.
- `npm run setup`: installs deps, runs `prisma generate`, applies migrations, and seeds dev data when missing.
- `npm run db:migrate`: applies committed migrations (use for fresh DBs, CI, and prod).
- `npm test`: runs backend unit tests (Node.js test runner).

More:

- `npm run setup:deps`: install backend/frontend dependencies using shared devcontainer caches when available.
- `npm run db:migrate:dev`: apply migrations and seed dev data when missing.
- `npm run db:migrate:create`: create/apply new Prisma migrations during local development.
- `npm run db:reset:dev`: destructive reset for a disposable devcontainer/worktree DB, then seed it.
- `npm run db:reset`: destructive reset (drops data and recreates schema).
- `npm run db:seed`: seed deterministic dev data (test user + sample logs).
- `npm --prefix backend run db:push:reset`: dev-only schema reset using `prisma db push` (fast, skips migrations).
- `npm run db:studio`: Prisma Studio (DB browser).
- `npm run build`: build the frontend.
- `npm run build:storybook`: build the static Storybook.
- `npm run lint`: lint the frontend.
- `npm run ci:local`: run the local equivalent of PR CI (backend build, frontend build, frontend lint, backend tests).
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

- For local push/PWA flow validation in dev mode, run `npm run dev` (service worker enabled by default in local dev scripts).
- Test locally: `npm --prefix frontend run build && npm --prefix frontend run preview` then open
  `http://localhost:4173` and use the browser install UI.
- iOS: open the app in Safari and use Share -> Add to Home Screen.

Push notes:

- Browser push registration and delivery require backend VAPID env vars: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`.
- In the devcontainer workflow, `.devcontainer/init-devcontainer-env.mjs` auto-generates missing VAPID keys and writes them into `.devcontainer/.env` during container initialization.
- For local backend runs outside the devcontainer (or for plain `docker compose`), set `WEB_PUSH_*` values explicitly (see `.env.example` and `backend/.env.example`).

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
