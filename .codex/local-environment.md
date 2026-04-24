# Codex Local Environment

Use this repo-owned setup script for Codex app worktrees:

```sh
node .codex/local-environment.setup.mjs
```

Configured Codex app actions:

| Name | Script |
| --- | --- |
| Dev | `node scripts/codex-worktree-env.mjs dev` |
| Dev test | `node scripts/codex-worktree-env.mjs dev:test` |
| Test | `node scripts/codex-worktree-env.mjs test` |
| Lint | `node scripts/codex-worktree-env.mjs lint` |
| Build | `node scripts/codex-worktree-env.mjs build` |
| Shell | `node scripts/codex-worktree-env.mjs shell` |
| Stop | `node scripts/codex-worktree-env.mjs down` |

The setup script uses `CODEX_WORKTREE_PATH` when Codex provides it and falls
back to the current directory outside the app. It is host-platform neutral, so
Windows Codex execution does not need WSL bash. It also copies the source
checkout's ignored `.env` into the new worktree if that file exists and the
worktree does not already have one.

Setup streams devcontainer logs as they are produced. New worktrees still need
to install backend/frontend dependencies and seed Postgres, but the devcontainer
shares a Docker npm cache volume named `calibrate-health-npm-cache` so repeated
setups can reuse downloaded packages.
