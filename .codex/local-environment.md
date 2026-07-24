# Codex Local Environment

Use this repo-owned setup script for Codex app worktrees:

```sh
node .codex/local-environment.setup.mjs
```

The ordinary `npm run dev`, `dev:setup`, `dev:build`, and `dev:down` commands use the same isolated devcontainer and
Postgres stack. Developers outside Codex therefore get the same setup behavior without running this Codex bootstrap
script or configuring database environment variables.

Configured Codex app actions:

| Name | Script |
| --- | --- |
| Recreate Devcontainer | `node scripts/codex-worktree-env.mjs devcontainer:recreate` |
| Stop Devcontainer | `node scripts/codex-worktree-env.mjs down` |
| Dev | `node scripts/codex-worktree-env.mjs dev` |
| Dev test | `node scripts/codex-worktree-env.mjs dev:test` |
| Test | `node scripts/codex-worktree-env.mjs test` |
| Lint | `node scripts/codex-worktree-env.mjs lint` |
| Build | `node scripts/codex-worktree-env.mjs build` |
| Shell | `node scripts/codex-worktree-env.mjs shell` |

The setup script uses `CODEX_WORKTREE_PATH` when Codex provides it and falls
back to the current directory outside the app. It is host-platform neutral, so
Windows Codex execution does not need WSL bash. It also copies the source
checkout's ignored `.env` into the new worktree if that file exists and the
worktree does not already have one.

Setup streams devcontainer logs as they are produced. The Dev and Setup actions install dependencies and seed Postgres
when needed. Root/mobile workspace and backend dependencies use lockfile-keyed Docker volumes, and downloads share the
`calibrate-health-npm-cache` volume so repeated setups can reuse both installed packages and cached artifacts.
