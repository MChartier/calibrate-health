#!/usr/bin/env bash
set -euo pipefail

# Production container entrypoint.
#
# We avoid storing a full DATABASE_URL secret by injecting DB components (host/user/password)
# separately. Prisma migrations still require DATABASE_URL, so we compose it here before
# running `prisma migrate deploy`.

urlencode() {
  # URL-encode a value for safe inclusion in DATABASE_URL (handles special chars in passwords).
  node -e 'console.log(encodeURIComponent(process.argv[1]))' "$1"
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  : "${DB_HOST:?Missing DB_HOST}"
  : "${DB_NAME:?Missing DB_NAME}"
  : "${DB_USER:?Missing DB_USER}"
  : "${DB_PASSWORD:?Missing DB_PASSWORD}"

  DB_PORT="${DB_PORT:-5432}"
  DB_SCHEMA="${DB_SCHEMA:-public}"
  DB_SSLMODE="${DB_SSLMODE:-require}"

  ENCODED_USER="$(urlencode "${DB_USER}")"
  ENCODED_PASS="$(urlencode "${DB_PASSWORD}")"
  ENCODED_DB_NAME="$(urlencode "${DB_NAME}")"
  ENCODED_SCHEMA="$(urlencode "${DB_SCHEMA}")"
  ENCODED_SSLMODE="$(urlencode "${DB_SSLMODE}")"

  export DATABASE_URL="postgresql://${ENCODED_USER}:${ENCODED_PASS}@${DB_HOST}:${DB_PORT}/${ENCODED_DB_NAME}?schema=${ENCODED_SCHEMA}&sslmode=${ENCODED_SSLMODE}"
fi

npm run db:migrate
exec npm run start
