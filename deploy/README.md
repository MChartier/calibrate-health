# Production self-hosting

The deployment files are portable Docker Compose building blocks. They intentionally contain no AWS, Terraform, or
other cloud-specific infrastructure. Choose one proxy file and optionally add the Postgres and encrypted-backup
overlays.

The published `Dockerfile.app` image serves the Expo Router/React Native Web static export and the API from one
origin. Expo documents, the service worker, and the install manifest are revalidated; hashed bundles use immutable
caching.

## Stack combinations

| Proxy | Database | Compose files |
| --- | --- | --- |
| Caddy | External Postgres | `docker-compose.yml` |
| Caddy | In-stack Postgres | `docker-compose.yml` + `docker-compose.postgres.yml` |
| Existing Traefik | External Postgres | `docker-compose.traefik.yml` |
| Existing Traefik | In-stack Postgres | `docker-compose.traefik.yml` + `docker-compose.postgres.yml` |

Add `docker-compose.backup.yml` to any combination for age-encrypted automated backups. Both proxies route only to a
healthy app and probe `/api/v1/readyz`; the endpoint returns 503 if Postgres is unavailable. The in-stack database has
its own `pg_isready` health check, and the app waits for it before running migrations.

## Initial configuration

1. Copy `.env.example` to `.env` and replace every placeholder used by your selected files.
2. Use a pinned immutable `APP_IMAGE` tag or digest for reproducible upgrades.
3. Generate `SESSION_SECRET` from at least 32 random bytes and keep it stable across restarts.
4. Point `APP_HOST` DNS at the proxy host. Caddy obtains certificates itself; Traefik uses the configured resolver and
   external Docker network.

The Compose files set `FRONTEND_DIST_DIR=/app/web/dist`, which is populated by the tagged application image. Do not
bind-mount a separately built web directory over it: server and web release provenance should remain the same image
digest and Git commit.

For Caddy, `CADDYFILE=./Caddyfile.prod` is the normal setting. Use `./Caddyfile.staging` only after setting a real
`BASIC_AUTH_USER` and Caddy password hash.

### Split frontend and API origins

The standard Compose files serve the frontend and API from `APP_HOST`. If a separate frontend origin is intentional,
set `CORS_ORIGINS` to its exact HTTPS origin (comma-separate multiple origins). Browser sessions require
`SESSION_COOKIE_SECURE=true`; use `SESSION_COOKIE_SAMESITE=none` for a cross-origin frontend and set
`SESSION_COOKIE_DOMAIN` only when a shared parent-domain cookie is intended. Prefer sibling HTTPS subdomains so the
frontend and API remain same-site: browsers may block cookies entirely across unrelated sites. Logout and account
deletion use the configured cookie domain, so changing that setting invalidates existing browser sessions.

### External Postgres

Set `DATABASE_URL`, including the intended Prisma `schema` and your provider's required `sslmode`. For encrypted
backups, also set `BACKUP_DB_*`; use a dedicated least-privilege backup user when your provider supports it.

```sh
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.backup.yml \
  up -d --build
```

Remove the backup file from the command only if another tested backup system owns database durability.

### In-stack Postgres

Set `POSTGRES_*`. Set `BACKUP_DB_HOST=db` and make `BACKUP_DB_NAME`, `BACKUP_DB_USER`, and `BACKUP_DB_PASSWORD` match
the Postgres values. The database is not published to the host or proxy network.

```sh
docker compose --env-file .env \
  -f docker-compose.yml \
  -f docker-compose.postgres.yml \
  -f docker-compose.backup.yml \
  up -d --build
```

For Traefik, replace the first file with `docker-compose.traefik.yml`. The configured `TRAEFIK_NETWORK` must already
exist.

## Startup, health, and upgrades

- The app runs `prisma migrate deploy` before opening its HTTP port. It retries a temporarily unavailable database for
  `MIGRATION_MAX_ATTEMPTS` with `MIGRATION_RETRY_SECONDS` delay, then exits so Compose can apply its restart policy.
- `/api/v1/healthz` is process liveness. `/api/v1/readyz` verifies a live Postgres query and is the Compose/proxy
  readiness probe.
- `restart: unless-stopped`, init handling, and stop grace periods cover normal host reboots and orderly Postgres
  shutdown. Do not scale the Compose app beyond one replica without separately designing migration and job ownership.
- Before an upgrade, confirm a recent encrypted backup exists. Pull the new immutable image, run `docker compose up -d`,
  and watch `docker compose logs -f app` until migrations and readiness succeed. Database migrations are forward-only;
  rollback means restoring a pre-upgrade backup into a clean database and running the matching prior image.

## Encrypted automated backups

The backup image contains Postgres 16 client tools and `age`. It creates custom-format `pg_dump` files, encrypts each
file before it enters the backup directory, atomically promotes completed files, and removes only completed encrypted
files older than `BACKUP_RETENTION_DAYS`. A failed backup retains no plaintext dump and retries after
`BACKUP_RETRY_SECONDS`.

Create an age identity on a trusted machine:

```sh
docker build -t calibrate-postgres-backup:local backup
umask 077
docker run --rm calibrate-postgres-backup:local age-keygen > backup-age-identity.txt
docker run --rm -i calibrate-postgres-backup:local age-keygen -y < backup-age-identity.txt
```

Put only the printed public `age1...` recipient in `.env`. Store the private identity off-host or in a separate secret
system; the scheduled backup container never receives it. Copy encrypted backups off the application host. A local
bind mount alone does not protect against disk loss, ransomware, or operator deletion.

Monitor `BACKUP_PATH/.last-success` and alert if it is older than two backup intervals. Perform a restore drill after
initial setup and at least quarterly.

## Clean-instance restore drill

The restore command refuses non-`/backups/calibrate-*.dump.age` paths, requires an explicit confirmation token, validates
the encrypted custom dump, and refuses a target containing any user tables.

1. Provision a new empty Postgres database. For an in-stack drill, use a new Compose project/volume and start only DB:

   ```sh
   docker compose -p calibrate-restore --env-file .env \
     -f docker-compose.yml -f docker-compose.postgres.yml \
     up -d db
   ```

2. Do not start the app yet; its startup migrations intentionally make the target non-empty.
3. Mount the age identity read-only and restore one encrypted file:

   ```sh
   docker compose -p calibrate-restore --env-file .env \
     -f docker-compose.yml -f docker-compose.postgres.yml -f docker-compose.backup.yml \
     run --rm \
     -e RESTORE_FILE=/backups/calibrate-YYYYMMDDTHHMMSSZ.dump.age \
     -e AGE_IDENTITY_FILE=/run/secrets/backup-age-identity \
     -e CONFIRM_RESTORE_TO_EMPTY_DATABASE=RESTORE \
     -v /secure/off-host/backup-age-identity.txt:/run/secrets/backup-age-identity:ro \
     backup /usr/local/bin/restore-postgres.sh
   ```

4. Start the matching app image. It applies migrations newer than the restored dump.
5. Wait for `/api/v1/readyz`, sign in, and verify representative food, weight, activity, device-session, and reminder
   data. Record the backup timestamp, restore duration, row checks, and image version. Destroy the drill stack afterward.

For external Postgres, use the same backup service against a newly created empty provider database and omit the
Postgres overlay.

## Resource and operations guidance

Small personal instances should start with roughly 0.5-1 CPU and 512-768 MiB for the app, 0.5-1 CPU and 512 MiB-1 GiB
for Postgres, 128 MiB for Caddy, and 256-512 MiB transient headroom for `pg_dump`. These are planning baselines, not
hard limits: imported history, concurrent users, Postgres maintenance, and backup size can require more. Monitor
container memory, CPU throttling, disk latency, database connections, volume free space, readiness, migration logs,
and backup age before setting limits.

Keep at least enough free disk for the live Postgres volume, one temporary unencrypted dump inside the ephemeral backup
container, the configured encrypted retention window, and database growth. The temporary dump is removed on success,
failure, and container termination.

## Static validation

From the repository root:

```sh
npm run test:deploy
npm run deploy:config:check
```

The first command checks safety invariants without Docker. The second renders all Caddy/Traefik plus external/in-stack
Postgres and backup combinations using `docker compose config`; it does not start containers or access the network.
