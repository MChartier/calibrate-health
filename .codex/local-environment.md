# Codex Local Environment

Use this repo-owned setup script for Codex app worktrees:

```sh
bash .codex/local-environment.setup.sh
```

Recommended Codex app actions:

| Name | Script |
| --- | --- |
| Devcontainer setup | `npm run codex:setup` |
| Dev server | `npm run codex:dev` |
| Dev server (test user) | `npm run codex:dev:test` |
| Test | `npm run codex:test` |
| Coverage | `npm run codex:test:coverage` |
| Lint | `npm run codex:lint` |
| Build | `npm run codex:build` |
| Shell | `npm run codex:shell` |
| Stop devcontainer | `npm run codex:down` |

The setup script uses `CODEX_WORKTREE_PATH` when Codex provides it and falls
back to the current directory outside the app. It also copies the source
checkout's ignored `.env` into the new worktree if that file exists and the
worktree does not already have one.
