# calibrate

calibrate is a responsive calorie tracker (desktop + mobile web) for people who want to lose (or maintain) weight by
logging food and weight, then comparing daily intake against an estimated target based on their profile.
If you self-host, your data stays in your own database.

- Hosted instance: https://calibratehealth.app
- Stack: Expo Router + React Native Web, Node.js + TypeScript + Express, Postgres (Prisma)
- Clients: one Expo codebase for the installable web client and native Android client

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
- Expo web dev/build/PWA: `docs/expo-web.md`
- Expo Android client: `mobile/README.md`
- First native release scope: `docs/release-scope.md`
- Android/Wear Play and health release worksheet: `docs/play-console-health-release-checklist.md`
- Current release-candidate notes: `docs/releases/0.12.0-native-0.1.0-wear-0.2.0.md`
- Security model and release threat review: `docs/security.md`, `docs/security-release-threat-model.md`
- Architecture decisions: `docs/architecture/`

## Self-hosting

### Docker Compose (single machine)

The portable production Compose files under `deploy/` support either Caddy or an existing Traefik deployment, with
either external Postgres or a private in-stack Postgres volume. An optional backup overlay creates age-encrypted
automated dumps with retention. The deployment intentionally has no AWS/Terraform dependency.

Quick start:

1. Build the production image:

   ```sh
   docker build -f Dockerfile.app -t calibrate:local .
   ```

2. Copy `deploy/.env.example` to `deploy/.env`, set `APP_IMAGE`, `APP_HOST`, `SESSION_SECRET`, and configure the chosen
   database mode. Generate an age identity and set its public recipient if using the recommended backup overlay.

3. Start the stack:

   ```sh
   cd deploy
   docker compose --env-file .env \
     -f docker-compose.yml \
     -f docker-compose.postgres.yml \
     -f docker-compose.backup.yml \
     up -d --build
   ```

   Omit `docker-compose.postgres.yml` when using external Postgres. Replace `docker-compose.yml` with
   `docker-compose.traefik.yml` when the host already runs Traefik.

Notes:

- Caddy needs ports 80/443 reachable from the internet and DNS pointing at the machine. Traefik uses its existing
  external network and certificate resolver.
- The app runs committed Prisma migrations before becoming ready. Compose and both proxies use DB-backed readiness.
- Restore drills refuse non-empty databases and require the age private identity plus explicit confirmation.

See [deploy/README.md](deploy/README.md) for external/in-stack commands, upgrade behavior, resource guidance,
encrypted backup monitoring, and the clean-instance restore procedure.

## Development

### One-command quickstart

Prerequisites are Node.js `20.19+` or `22.12+`, npm, and Docker Desktop. The Docker daemon does not need to be open
first on Windows or macOS; the launcher attempts to start Docker Desktop and waits for it to become ready.

```sh
npm run dev
```

That command creates or reuses an isolated devcontainer for the current worktree, starts its Postgres service, installs
the Expo workspace and backend dependencies, generates Prisma, applies migrations, seeds deterministic test data, and
starts the backend plus Expo web client. The generated client and API URLs are printed in the terminal. No local
Postgres install, `.env` file, or per-machine environment variables are required for the standard workflow.

Dependencies use lockfile-keyed Docker volumes, including the root Expo workspace, so Linux container packages never
overwrite host packages and sibling worktrees can reuse valid caches. Each worktree also receives stable, non-conflicting
ports and its own database volume.

The normal development lifecycle is intentionally small:

- `npm run dev`: bootstrap anything missing and run the backend plus Expo web with the seeded user signed in.
- `npm run dev:bootstrap`: create the devcontainer and Postgres service without installing app dependencies.
- `npm run dev:setup`: install Expo/backend dependencies, generate Prisma, migrate, and seed without starting servers.
- `npm run dev:build`: run the same setup preflight, then build and validate the Expo web export.
- `npm run dev:manual-auth`: run the app without automatic test-user login.
- `npm run dev:reset`: reset the disposable worktree database and restore seed data.
- `npm run dev:shell`: open a shell in the worktree devcontainer.
- `npm run dev:down`: stop and remove the worktree's containers; named dependency and database volumes are retained.

Setup is incremental: current dependencies, applied migrations, and existing seed data are skipped. Run
`npm run dev:bootstrap` only when you specifically want infrastructure without application setup; most developers can
use `npm run dev` directly after cloning.

#### Advanced host and worktree commands

`npm run dev:host` runs the preflight and servers directly on the host for developers who intentionally manage their own
Postgres instance and `backend/.env`. It is not required for normal development.

The lower-level devcontainer helpers remain available for selecting another worktree by branch or path:

- `npm run devcontainer:up -- <branch|path>`
- `npm run devcontainer:up:new -- <branch|path>`
- `npm run devcontainer:shell -- <branch|path>`
- `npm run devcontainer:shell:new -- <branch|path>`

Codex app actions use the same devcontainer launcher and caches as the ordinary `dev:*` commands. Codex-specific aliases
such as `npm run codex:dev`, `npm run codex:setup-app`, and `npm run codex:ci` remain available for app actions.

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

#### Dev test user

The seed script creates a deterministic local test account (`test@calibratehealth.app`). To speed up onboarding
iterations, the local app auto-logs in this user by default. The backend creates the seeded data on demand when the
database is otherwise ready:

- Start with automatic test-user login: `npm run dev` (`npm run dev:test` remains as a compatible alias)
- Exercise the login and registration screens instead: `npm run dev:manual-auth`
- Reset the test user onboarding state: `npm run dev:reset-test-user-onboarding`

### Common scripts

- `npm run dev`: provisions the devcontainer/Postgres stack, installs missing dependencies, verifies migrations and
  seed data, then runs the backend and Expo web client with the seeded dev user logged in.
- `npm run dev:test`: explicit alias for the same preflight and seeded-user workflow.
- `npm run dev:manual-auth`: runs the same preflight and local stack without auto-login for authentication testing.
- `npm run dev:setup`: prepares dependencies, Prisma, migrations, and seed data without starting the servers.
- `npm run dev:build`: prepares the environment and validates the Expo web production export.
- `npm run dev:reset`: reset the disposable worktree database and seed it again.
- `npm run dev:down`: stop the current worktree's devcontainer stack.
- `npm run dev:reset-test-user-onboarding`: reset the dev test user to pre-onboarding.
- `npm run dev:backend`: advanced host-only backend launcher.
- `npm run dev:frontend` / `npm run dev:expo-web`: advanced host-only Expo web launcher.
- `npm run setup`: lower-level in-container/host setup for the root/mobile workspace and backend.
- `npm run db:migrate`: applies committed migrations (use for fresh DBs, CI, and prod).
- `npm test`: runs backend, API client, and Expo client unit tests.

More:

- `npm run setup:deps`: install root/mobile and backend dependencies using shared devcontainer caches when available.
- `npm run db:migrate:dev`: apply migrations and seed dev data when missing.
- `npm run db:migrate:create`: create/apply new Prisma migrations during local development.
- `npm run db:reset:dev`: destructive reset for a disposable devcontainer/worktree DB, then seed it.
- `npm run db:reset`: destructive reset (drops data and recreates schema).
- `npm run db:seed`: seed deterministic dev data (test user + sample logs).
- `npm --prefix backend run db:push:reset`: dev-only schema reset using `prisma db push` (fast, skips migrations).
- `npm run db:studio`: Prisma Studio (DB browser).
- `npm run build`: build the Expo web production export.
- `npm run build:expo-web`: lower-level Expo web export without the devcontainer setup preflight; prefer `dev:build` from the host.
- `npm run build:mobile`: type-check the Expo React Native Android client.
- `npm run test:mobile`: run mobile unit tests.
- `npm run test:web:e2e`: build the Expo web release export and run its local Chrome E2E suite.
- `npm run lint`: type-check the Expo client.
- `npm run ci:local`: run the local equivalent of PR CI (backend and Expo web builds, Expo release validation, type-checking, and backend/mobile tests).
- `npm run test:coverage`: collect backend and Expo client coverage.

### Docker Compose (dev stack)

The repo root `docker-compose.yml` is a development stack that starts `postgres`, `backend`, and Expo `web` with live
reload and dev-only defaults.

```sh
docker compose up --build
```

## PWA (installable)

The production Expo web client is configured as a Progressive Web App, so it can be installed on desktop/mobile and
added to a home screen. The tagged `Dockerfile.app` image serves this export from the same origin as the API.

- For local API work, run `npm run dev:backend`; run the Expo web client from `mobile/` when testing the production UI.
- Test the release artifact locally with `npm run build:expo-web` followed by
  `npm --prefix mobile run preview:web`, then open `http://localhost:4174` and use the browser install UI.
- iOS: open the app in Safari and use Share -> Add to Home Screen.

Push notes:

- Browser push registration and delivery require backend VAPID env vars: `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and `WEB_PUSH_SUBJECT`.
- Native Android push is disabled by default for self-hosting. Set `NATIVE_PUSH_MODE=expo` only when the instance intentionally uses Expo Push Service for private/internal builds.
- In the devcontainer workflow, `.devcontainer/init-devcontainer-env.mjs` auto-generates missing VAPID keys and writes them into `.devcontainer/.env` during container initialization.
- For local backend runs outside the devcontainer (or for plain `docker compose`), set `WEB_PUSH_*` values explicitly (see `.env.example` and `backend/.env.example`).

## Android native client

The `mobile/` workspace is an Expo development-build React Native app. It uses native navigation, secure token storage,
Expo push notifications, haptics, camera barcode scanning, and the shared Calibrate API client.

Quick start:

```sh
npm run dev
```

This standard path brings up the local API, Postgres, and Expo web client. Host-side native Android commands still use
the commands in `mobile/README.md` when Android build tools are available.

For Android emulator development, the app defaults to `http://10.0.2.2:3000` in dev builds so it can reach the local
backend. Production builds default to `https://calibratehealth.app`, and the sign-in screen allows a custom self-hosted
server URL.

Native auth is bearer-token based and additive to the existing browser cookie session flow. Mobile tokens are opaque to
the client, hashed at rest on the server, and stored on-device through Expo SecureStore.

## Production / staging (single origin)

Production is hosted at `https://calibratehealth.app` and staging is hosted at `https://staging.calibratehealth.app`.

This app is configured for a "single origin" deployment where the Expo web client and backend share the same host. In that
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
- Wear pairing requires HTTPS in production and staging. A LAN/loopback-only self-host can explicitly set
  `ALLOW_INSECURE_WEAR_PAIRING=true`, but the backend will warn because pairing credentials and health traffic
  can be intercepted over cleartext HTTP.

See [docs/security.md](docs/security.md) for the browser CSRF posture, native bearer-token model,
authentication rate limits, and device-session behavior.

Optional redacted JSON request logs and bearer-protected, process-local counters are documented in
[docs/observability.md](docs/observability.md). Diagnostics are disabled by default and have no external SaaS exporter.

The shared client uses the stable `/api/v1` resource API. See
[docs/api-versioning.md](docs/api-versioning.md) and [docs/openapi/v1.yaml](docs/openapi/v1.yaml)
for compatibility and wire-contract policy.
