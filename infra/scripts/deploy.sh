#!/usr/bin/env bash
set -euo pipefail

# Deploy the calibratehealth Docker Compose stack on an EC2 host.
#
# This script is intended to be executed via AWS SSM Run Command. It pulls the
# latest image tag (staging/prod), runs Prisma migrations against RDS, and
# restarts the app with a freshly-rendered `.env` file sourced from Secrets Manager.

# Resolve config relative to the deploy script so the host bootstrap only needs
# to keep deploy.sh + config.env together.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${CONFIG_PATH:-${SCRIPT_DIR}/config.env}"

require_cmd() {
  # Print a clear error if a required binary is missing (SSM output is the main debugging surface).
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_env() {
  # Fail fast on missing config values so we don't partially update the deployment.
  local key="$1"
  local value="${!key:-}"
  if [[ -z "$value" ]]; then
    echo "Missing required env var: $key" >&2
    exit 1
  fi
}

resolve_compose_argv() {
  # Print the Compose invocation as newline-separated argv.
  # Prefer the Docker CLI plugin (`docker compose`), but fall back to legacy `docker-compose`
  # when the plugin isn't installed on the host.
  if docker compose version >/dev/null 2>&1; then
    printf "%s\n" docker compose
    return 0
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    printf "%s\n" docker-compose
    return 0
  fi

  echo "Missing Docker Compose (expected 'docker compose' plugin or 'docker-compose' binary)." >&2
  exit 1
}

if [[ ! -f "$CONFIG_PATH" ]]; then
  echo "Missing config file: $CONFIG_PATH" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_PATH"

require_cmd aws
require_cmd jq
require_cmd docker

# Ensure we can run Compose before doing any deploy work.
mapfile -t COMPOSE < <(resolve_compose_argv)

require_env AWS_REGION
require_env APP_DIR
require_env APP_SECRET_ARN
require_env RDS_SECRET_ARN
require_env RDS_ADDRESS
require_env RDS_PORT
require_env RDS_DB_NAME
require_env ECR_REPOSITORY_URL
require_env DEPLOY_TAG

APP_IMAGE="${ECR_REPOSITORY_URL}:${DEPLOY_TAG}"
ECR_REGISTRY="${ECR_REPOSITORY_URL%%/*}"

APP_SECRET_JSON="$(
  aws secretsmanager get-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$APP_SECRET_ARN" \
    --query SecretString \
    --output text
)"

SESSION_SECRET="$(echo "$APP_SECRET_JSON" | jq -r '.session_secret // empty')"
CADDY_EMAIL="$(echo "$APP_SECRET_JSON" | jq -r '.caddy_email // empty')"
BASIC_AUTH_USER="$(echo "$APP_SECRET_JSON" | jq -r '.basic_auth_user // empty')"
BASIC_AUTH_HASH="$(echo "$APP_SECRET_JSON" | jq -r '.basic_auth_hash // empty')"

if [[ -z "$SESSION_SECRET" ]]; then
  echo "App secret is missing required field: session_secret" >&2
  exit 1
fi

if [[ "${ENVIRONMENT:-}" == "staging" ]]; then
  if [[ -z "$BASIC_AUTH_USER" || -z "$BASIC_AUTH_HASH" ]]; then
    echo "Staging requires basic_auth_user + basic_auth_hash in the app secret." >&2
    exit 1
  fi
fi

RDS_SECRET_JSON="$(
  aws secretsmanager get-secret-value \
    --region "$AWS_REGION" \
    --secret-id "$RDS_SECRET_ARN" \
    --query SecretString \
    --output text
)"

DB_USER="$(echo "$RDS_SECRET_JSON" | jq -r '.username // empty')"
DB_PASS="$(echo "$RDS_SECRET_JSON" | jq -r '.password // empty')"

if [[ -z "$DB_USER" || -z "$DB_PASS" ]]; then
  echo "RDS secret is missing username/password fields." >&2
  exit 1
fi

DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${RDS_ADDRESS}:${RDS_PORT}/${RDS_DB_NAME}?schema=public&sslmode=require"

export APP_IMAGE
export DATABASE_URL
export SESSION_SECRET
export CADDY_EMAIL
export BASIC_AUTH_USER
export BASIC_AUTH_HASH

cd "$APP_DIR"

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

"${COMPOSE[@]}" pull app

# Run migrations before swapping the running container to minimize deploy-time downtime.
"${COMPOSE[@]}" run --rm app npm run db:migrate

"${COMPOSE[@]}" up -d --remove-orphans

"${COMPOSE[@]}" ps
