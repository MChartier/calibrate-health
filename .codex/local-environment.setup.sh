#!/usr/bin/env bash
set -euo pipefail

worktree_path="${CODEX_WORKTREE_PATH:-$PWD}"
source_tree_path="${CODEX_SOURCE_TREE_PATH:-}"

if [ ! -d "$worktree_path" ]; then
  echo "Codex worktree path does not exist: $worktree_path" >&2
  exit 1
fi

# Codex worktrees only contain tracked files; copy the developer's ignored
# repo-local env file once so the devcontainer can receive provider/API secrets.
if [ -n "$source_tree_path" ] && [ "$source_tree_path" != "$worktree_path" ]; then
  if [ -f "$source_tree_path/.env" ] && [ ! -f "$worktree_path/.env" ]; then
    cp "$source_tree_path/.env" "$worktree_path/.env"
  fi
fi

cd "$worktree_path"
if [ ! -x "node_modules/.bin/devcontainer" ]; then
  if [ -f "package-lock.json" ]; then
    npm ci --ignore-scripts
  else
    npm install --ignore-scripts
  fi
fi
npm run codex:setup
