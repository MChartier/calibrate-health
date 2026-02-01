#!/usr/bin/env bash
set -euo pipefail

# Configure GitHub auth for `gh` and HTTPS `git push` when a token is provided, without blocking container startup.
if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found; skipping GitHub auth setup."
  exit 0
fi

github_token="${GH_AUTH_TOKEN:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"
if [ -z "$github_token" ]; then
  echo "GH_AUTH_TOKEN/GH_TOKEN/GITHUB_TOKEN not set; skipping GitHub auth setup."
  exit 0
fi

export GH_AUTH_TOKEN="$github_token"
export GH_TOKEN="$github_token"
export GITHUB_TOKEN="$github_token"

to_https_github_url() {
  local url
  url="$1"

  if [[ "$url" =~ ^https://github\.com/ ]]; then
    printf '%s' "$url"
    return 0
  fi

  if [[ "$url" =~ ^git@github\.com:(.+)$ ]]; then
    printf 'https://github.com/%s' "${BASH_REMATCH[1]}"
    return 0
  fi

  if [[ "$url" =~ ^ssh://git@github\.com/(.+)$ ]]; then
    printf 'https://github.com/%s' "${BASH_REMATCH[1]}"
    return 0
  fi

  printf ''
}

# Configure a Git credential helper for GitHub specifically (keeps the global helper intact).
if ! git config --global credential.https://github.com.helper '!gh auth git-credential' >/dev/null 2>&1; then
  echo "Failed to configure GitHub git-credential helper; HTTPS pushes may prompt for credentials."
fi

# If the repo uses an SSH origin, set only the *push* URL to HTTPS so `git push` works with the token.
if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
  origin_fetch_url="$(git remote get-url origin)"
  origin_push_url="$(git remote get-url --push origin)"
  origin_https_url="$(to_https_github_url "$origin_fetch_url")"

  if [ -n "$origin_https_url" ] && [ "$origin_fetch_url" = "$origin_push_url" ] && [ "$origin_fetch_url" != "$origin_https_url" ]; then
    if ! git remote set-url --push origin "$origin_https_url" >/dev/null 2>&1; then
      echo "Failed to set origin push URL to HTTPS; pushes may require SSH auth."
    fi
  fi
fi
