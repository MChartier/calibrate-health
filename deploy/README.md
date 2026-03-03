# Deployment Compose Stack

This folder contains a small production-oriented Docker Compose stack for:

- self-hosting setups (swap the image registry/tag as desired), and
- optional EC2 Compose hosts (the primary AWS infra in `infra/` uses ECS Fargate instead).

## Files

- `deploy/docker-compose.yml`: Caddy (TLS + reverse proxy) + the app container.
- `deploy/docker-compose.traefik.yml`: Traefik-labeled app + in-stack Postgres (for servers already running Traefik).
- `deploy/Caddyfile.prod`: `calibratehealth.app` + `www` redirect.
- `deploy/Caddyfile.staging`: `staging.calibratehealth.app` protected with HTTP basic auth.
- `deploy/.env.traefik.example`: environment template for the Traefik stack.

For actual use, the Caddy container expects a `Caddyfile` next to `docker-compose.yml`.

## Required Environment Variables

- `APP_IMAGE`: Full image reference (ECR or GHCR) including tag.
- `DATABASE_URL`: Postgres connection string.
- `SESSION_SECRET`: Express session signing secret.

## Optional Environment Variables

- `CADDY_EMAIL`: Email used for ACME registration (Let's Encrypt).

Staging-only:

- `BASIC_AUTH_USER`
- `BASIC_AUTH_HASH` (Caddy hash, generated via `caddy hash-password`).

## Notes

- The app image runs `npm run db:migrate` on startup (see `backend/scripts/start-prod.sh`), so ensure your database is reachable before bringing the stack up.
- This stack assumes a single-origin deployment (Caddy + app). For split frontend/backend hosting, set `CORS_ORIGINS` and related session cookie settings; see the root `README.md`.

## Traefik + Postgres stack

If your host already runs Traefik, use `deploy/docker-compose.traefik.yml`:

1. Copy env template:

```sh
cd deploy
cp .env.traefik.example .env
```

2. Edit `.env` (at minimum: `APP_HOST`, `SESSION_SECRET`, `POSTGRES_PASSWORD`, and `APP_IMAGE`).
3. Ensure your Traefik Docker network exists (defaults to `traefik`).
4. Start:

```sh
docker compose -f docker-compose.traefik.yml up -d
```

This stack routes `APP_HOST` through Traefik and persists Postgres data in the `postgres_data` volume.
