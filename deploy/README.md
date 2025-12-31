# Deployment Compose Stack

This folder contains a small production-oriented Docker Compose stack used for:

- AWS EC2 deployments (via Terraform + SSM), and
- optional self-hosting setups (swap the image registry/tag as desired).

## Files

- `deploy/docker-compose.yml`: Caddy (TLS + reverse proxy) + the app container.
- `deploy/Caddyfile.prod`: `calibratehealth.app` + `www` redirect.
- `deploy/Caddyfile.staging`: `staging.calibratehealth.app` protected with HTTP basic auth.

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

