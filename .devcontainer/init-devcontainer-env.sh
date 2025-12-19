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
color_index="$((hash % ${#worktree_colors[@]}))"
derived_color="${worktree_colors[$color_index]}"

worktree_color="$derived_color"
vite_worktree_color="$derived_color"

if [ "$is_main_worktree" = "true" ]; then
  worktree_color="$base_peacock_color"
  vite_worktree_color=""
fi

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
EOF

if [ -f "$env_path" ] && cmp -s "$tmp_path" "$env_path"; then
  rm "$tmp_path"
else
  mv "$tmp_path" "$env_path"
fi
