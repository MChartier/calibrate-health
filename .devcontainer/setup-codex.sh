#!/usr/bin/env bash
set -euo pipefail

# Configure Codex auth when a key is provided, without blocking container startup.
if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found; skipping auth setup."
  exit 0
fi

if [ -z "${CODEX_API_KEY:-}" ]; then
  echo "CODEX_API_KEY not set; skipping codex login."
  exit 0
fi

if ! printf '%s' "$CODEX_API_KEY" | codex login --with-api-key >/dev/null 2>&1; then
  echo "codex login failed; check CODEX_API_KEY."
fi
