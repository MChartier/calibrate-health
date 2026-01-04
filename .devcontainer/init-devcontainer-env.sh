#!/usr/bin/env bash
set -euo pipefail

workspace_root="$(pwd)"
workspace_name="$(basename "$workspace_root")"
project_slug="$(printf '%s' "$workspace_name" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed -e 's/^-*//' -e 's/-*$//')"
is_main_worktree="false"

if [ -d "${workspace_root}/.git" ]; then
  is_main_worktree="true"
fi

if [ -z "$project_slug" ]; then
  project_slug="cal-io"
fi

hash="$(printf '%s' "$workspace_name" | cksum | awk '{print $1}')"
offset="$((hash % 1000))"

backend_port="$((3000 + offset))"
frontend_port="$((5173 + offset))"
base_peacock_color="#007fff"
worktree_colors=(
  "#0f766e"
  "#0e7490"
  "#2f855a"
  "#4d7c0f"
  "#b45309"
  "#c2410c"
  "#b91c1c"
  "#a21caf"
  "#6d28d9"
  "#4b5563"
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

# Allow the host to provide either OPENAI_API_KEY or CODEX_API_KEY for Codex auth.
codex_api_key="${CODEX_API_KEY:-${OPENAI_API_KEY:-}}"

env_path=".devcontainer/.env"
tmp_path="${env_path}.tmp"

cat > "$tmp_path" <<EOF
COMPOSE_PROJECT_NAME=${project_slug}
WORKSPACE_FOLDER_NAME=${workspace_name}
BACKEND_PORT=${backend_port}
FRONTEND_PORT=${frontend_port}
VITE_DEV_SERVER_PORT=${frontend_port}
WORKTREE_NAME=${workspace_name}
WORKTREE_IS_MAIN=${is_main_worktree}
WORKTREE_COLOR=${worktree_color}
VITE_WORKTREE_COLOR=${vite_worktree_color}
VITE_WORKTREE_NAME=${workspace_name}
VITE_WORKTREE_IS_MAIN=${is_main_worktree}
# Sourced from the host environment during devcontainer init so Docker can pass it into the container.
USDA_API_KEY=${USDA_API_KEY:-}
CODEX_API_KEY=${codex_api_key}
EOF

if [ -f "$env_path" ] && cmp -s "$tmp_path" "$env_path"; then
  rm "$tmp_path"
else
  mv "$tmp_path" "$env_path"
fi
