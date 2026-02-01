#!/usr/bin/env bash
set -euo pipefail

# Verify Codex auth is available via the mounted CODEX_HOME directory.
if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found; skipping auth setup."
  exit 0
fi

codex_home="${CODEX_HOME:-$HOME/.codex}"
codex_host_home="${CODEX_HOST_HOME:-$HOME/.codex-host}"
codex_host_auth="${codex_host_home}/auth.json"
codex_auth="${codex_home}/auth.json"

mkdir -p "$codex_home"

if [ -f "$codex_host_auth" ]; then
  if [ ! -f "$codex_auth" ] || ! cmp -s "$codex_host_auth" "$codex_auth"; then
    cp "$codex_host_auth" "$codex_auth"
  fi
else
  echo "No Codex auth found in ${codex_host_home}. Run 'codex login --device-auth' on the host and rebuild."
fi
