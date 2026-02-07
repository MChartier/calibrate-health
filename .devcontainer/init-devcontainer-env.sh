#!/usr/bin/env bash
set -euo pipefail

workspace_root="$(pwd)"
workspace_name="$(basename "$workspace_root")"
project_slug="$(printf '%s' "$workspace_name" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed -e 's/^-*//' -e 's/-*$//')"
is_main_worktree="false"

if [ -d "${workspace_root}/.git" ]; then
  is_main_worktree="true"
fi

# Resolve the shared .git directory so worktree Git commands function inside containers.
git_common_dir=""
main_worktree_name="$workspace_name"
if git_common_dir="$(git rev-parse --git-common-dir 2>/dev/null)"; then
  if [ -n "$git_common_dir" ]; then
    if [ "${git_common_dir#/}" = "$git_common_dir" ]; then
      git_common_dir="${workspace_root}/${git_common_dir}"
    fi

    if [ -d "$git_common_dir" ]; then
      git_common_dir="$(cd "$git_common_dir" && pwd)"
      main_worktree_name="$(basename "$(dirname "$git_common_dir")")"
    else
      git_common_dir=""
    fi
  fi
fi

if [ -z "$git_common_dir" ]; then
  echo "Unable to resolve the git common directory; worktree Git commands will fail in the container." >&2
  echo "Run this script from a git worktree, or ensure git is available on the host." >&2
  exit 1
fi

repo_dotenv_path="${workspace_root}/.env"
devcontainer_dotenv_path="${workspace_root}/.devcontainer/.env"

# Best-effort parse of a single `KEY=value` from a dotenv file (without executing it).
read_dotenv_value_from_file() {
  local dotenv_path key line value
  dotenv_path="$1"
  key="$2"

  if [ ! -f "$dotenv_path" ]; then
    printf ''
    return 0
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    line="${line#"${line%%[![:space:]]*}"}"
    if [ -z "$line" ] || [ "${line:0:1}" = "#" ]; then
      continue
    fi

    if [[ "$line" == export\ * ]]; then
      line="${line#export }"
      line="${line#"${line%%[![:space:]]*}"}"
    fi

    if [[ "$line" != "${key}="* ]]; then
      continue
    fi

    value="${line#${key}=}"
    value="${value#"${value%%[![:space:]]*}"}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi

    printf '%s' "$value"
    return 0
  done < "$dotenv_path"

  printf ''
}

# Best-effort parse of a single `KEY=value` from the repo-local `.env` file.
read_repo_dotenv_value() {
  local key
  key="$1"
  read_dotenv_value_from_file "$repo_dotenv_path" "$key"
}

# Generate VAPID keys in a Node-compatible format when local push env vars are unset.
generate_web_push_vapid_key_lines() {
  if ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  node <<'NODE'
const crypto = require('node:crypto');

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function toBase64Url(value) {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const publicJwk = publicKey.export({ format: 'jwk' });
const privateJwk = privateKey.export({ format: 'jwk' });

if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
  throw new Error('Failed to export VAPID JWK components.');
}

const x = fromBase64Url(publicJwk.x);
const y = fromBase64Url(publicJwk.y);
const d = fromBase64Url(privateJwk.d);

if (x.length !== 32 || y.length !== 32 || d.length !== 32) {
  throw new Error('Unexpected VAPID key length.');
}

const uncompressedPublicKey = Buffer.concat([Buffer.from([0x04]), x, y]);
process.stdout.write(`WEB_PUSH_PUBLIC_KEY=${toBase64Url(uncompressedPublicKey)}\n`);
process.stdout.write(`WEB_PUSH_PRIVATE_KEY=${toBase64Url(d)}\n`);
NODE
}

if [ -z "$project_slug" ]; then
  project_slug="cal-io"
fi

hash="$(printf '%s' "$workspace_name" | cksum | awk '{print $1}')"
offset="$((hash % 1000))"

backend_port="$((3000 + offset))"
frontend_port="$((5173 + offset))"
# Keep in sync with the frontend default primary color.
base_peacock_color="#0077ff"
# Distinct hues with consistent saturation/brightness so adjacent worktrees pop.
worktree_colors=(
  "#ca2b2b"
  "#2bca2b"
  "#2b7aca"
  "#ca7a2b"
  "#7a2bca"
  "#2bcaa2"
  "#a2ca2b"
  "#ca2b7a"
)
greek_letters=(
  alpha
  beta
  gamma
  delta
  epsilon
  zeta
  eta
  theta
  iota
  kappa
  lambda
  mu
  nu
  xi
  omicron
  pi
  rho
  sigma
  tau
  upsilon
  phi
  chi
  psi
  omega
)

# Echo the 0-based Greek letter index when the workspace name follows `<base>-<letter>`.
# Returns an empty string when the name doesn't match the expected pattern.
get_greek_letter_index() {
  local name_lower candidate i
  name_lower="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  candidate="${name_lower##*-}"

  for i in "${!greek_letters[@]}"; do
    if [ "${greek_letters[$i]}" = "$candidate" ]; then
      printf '%s' "$i"
      return 0
    fi
  done

  printf ''
}

greek_letter_index="$(get_greek_letter_index "$workspace_name")"
if [ -n "$greek_letter_index" ]; then
  # Use a stable mapping for Greek-letter worktrees so consecutive names don't collide.
  color_index="$((greek_letter_index % ${#worktree_colors[@]}))"
else
  color_index="$((hash % ${#worktree_colors[@]}))"
fi
derived_color="${worktree_colors[$color_index]}"

worktree_color="$derived_color"
vite_worktree_color="$derived_color"

if [ "$is_main_worktree" = "true" ]; then
  worktree_color="$base_peacock_color"
  vite_worktree_color=""
fi

repo_codex_home="$(read_repo_dotenv_value "CODEX_HOME")"
# Prefer the host CODEX_HOME when set; default to ~/.codex so auth can be mounted into the container.
codex_host_home="${CODEX_HOME:-${repo_codex_home:-$HOME/.codex}}"
if [ "$codex_host_home" = "~" ]; then
  codex_host_home="$HOME"
elif [[ "$codex_host_home" == "~/"* ]]; then
  codex_host_home="$HOME/${codex_host_home#~/}"
fi
if [ "${codex_host_home#/}" = "$codex_host_home" ]; then
  codex_host_home="$HOME/$codex_host_home"
fi

repo_fatsecret_client_id="$(read_repo_dotenv_value "FATSECRET_CLIENT_ID")"
fatsecret_client_id="${FATSECRET_CLIENT_ID:-${repo_fatsecret_client_id:-}}"

repo_fatsecret_client_secret="$(read_repo_dotenv_value "FATSECRET_CLIENT_SECRET")"
fatsecret_client_secret="${FATSECRET_CLIENT_SECRET:-${repo_fatsecret_client_secret:-}}"

repo_usda_api_key="$(read_repo_dotenv_value "USDA_API_KEY")"
usda_api_key="${USDA_API_KEY:-${repo_usda_api_key:-}}"

existing_web_push_public_key="$(read_dotenv_value_from_file "$devcontainer_dotenv_path" "WEB_PUSH_PUBLIC_KEY")"
existing_web_push_private_key="$(read_dotenv_value_from_file "$devcontainer_dotenv_path" "WEB_PUSH_PRIVATE_KEY")"
existing_web_push_subject="$(read_dotenv_value_from_file "$devcontainer_dotenv_path" "WEB_PUSH_SUBJECT")"

repo_web_push_public_key="$(read_repo_dotenv_value "WEB_PUSH_PUBLIC_KEY")"
web_push_public_key="${WEB_PUSH_PUBLIC_KEY:-${repo_web_push_public_key:-${existing_web_push_public_key:-}}}"

repo_web_push_private_key="$(read_repo_dotenv_value "WEB_PUSH_PRIVATE_KEY")"
web_push_private_key="${WEB_PUSH_PRIVATE_KEY:-${repo_web_push_private_key:-${existing_web_push_private_key:-}}}"

repo_web_push_subject="$(read_repo_dotenv_value "WEB_PUSH_SUBJECT")"
web_push_subject="${WEB_PUSH_SUBJECT:-${repo_web_push_subject:-${existing_web_push_subject:-}}}"

if [ -z "$web_push_public_key" ] || [ -z "$web_push_private_key" ]; then
  generated_web_push_lines="$(generate_web_push_vapid_key_lines || true)"
  if [ -n "$generated_web_push_lines" ]; then
    generated_web_push_public_key=""
    generated_web_push_private_key=""
    while IFS='=' read -r key value; do
      case "$key" in
        WEB_PUSH_PUBLIC_KEY)
          generated_web_push_public_key="$value"
          ;;
        WEB_PUSH_PRIVATE_KEY)
          generated_web_push_private_key="$value"
          ;;
      esac
    done <<EOF
$generated_web_push_lines
EOF

    if [ -n "$generated_web_push_public_key" ] && [ -n "$generated_web_push_private_key" ]; then
      if [ -z "$web_push_public_key" ]; then
        web_push_public_key="$generated_web_push_public_key"
      fi
      if [ -z "$web_push_private_key" ]; then
        web_push_private_key="$generated_web_push_private_key"
      fi
      echo "Generated local WEB_PUSH VAPID keys for devcontainer startup." >&2
    else
      echo "Unable to parse generated WEB_PUSH VAPID keys; push notifications remain disabled." >&2
    fi
  else
    echo "Unable to auto-generate WEB_PUSH VAPID keys; push notifications remain disabled." >&2
  fi
fi

if [ -z "$web_push_subject" ]; then
  web_push_subject="mailto:dev@calibrate.local"
fi

repo_calibrate_gh_pat="$(read_repo_dotenv_value "CALIBRATE_GH_PAT")"
repo_gh_auth_token="$(read_repo_dotenv_value "GH_AUTH_TOKEN")"
repo_github_token="$(read_repo_dotenv_value "GITHUB_TOKEN")"
repo_gh_token="$(read_repo_dotenv_value "GH_TOKEN")"
github_token="${CALIBRATE_GH_PAT:-${GH_AUTH_TOKEN:-${GH_TOKEN:-${GITHUB_TOKEN:-${repo_calibrate_gh_pat:-${repo_gh_auth_token:-${repo_gh_token:-${repo_github_token:-}}}}}}}}"

env_path=".devcontainer/.env"
tmp_path="${env_path}.tmp"


cat > "$tmp_path" <<EOF
COMPOSE_PROJECT_NAME=${project_slug}
WORKSPACE_FOLDER_NAME=${workspace_name}
MAIN_WORKTREE_NAME=${main_worktree_name}
GIT_COMMON_DIR=${git_common_dir}
BACKEND_PORT=${backend_port}
FRONTEND_PORT=${frontend_port}
VITE_DEV_SERVER_PORT=${frontend_port}
WORKTREE_NAME=${workspace_name}
WORKTREE_IS_MAIN=${is_main_worktree}
WORKTREE_COLOR=${worktree_color}
VITE_WORKTREE_COLOR=${vite_worktree_color}
VITE_WORKTREE_NAME=${workspace_name}
VITE_WORKTREE_IS_MAIN=${is_main_worktree}
# Sourced from the host environment or repo-local .env during devcontainer init so Docker can pass it into the container.
FATSECRET_CLIENT_ID=${fatsecret_client_id}
FATSECRET_CLIENT_SECRET=${fatsecret_client_secret}
USDA_API_KEY=${usda_api_key}
WEB_PUSH_PUBLIC_KEY=${web_push_public_key}
WEB_PUSH_PRIVATE_KEY=${web_push_private_key}
WEB_PUSH_SUBJECT=${web_push_subject}
CODEX_HOST_HOME=${codex_host_home}
GH_AUTH_TOKEN=${github_token}
GITHUB_TOKEN=${github_token}
GH_TOKEN=${github_token}
EOF

if [ -f "$env_path" ] && cmp -s "$tmp_path" "$env_path"; then
  rm "$tmp_path"
else
  mv "$tmp_path" "$env_path"
fi
