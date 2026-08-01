# Codex Local Environment

Codex runs on the host, while the live application uses a worktree-scoped
Docker Compose stack. The setup hook installs host dependencies so tests,
builds, linting, and Prisma commands use the same checkout that Codex edits.
It does not start Docker containers.

Use the repo-owned setup script manually when needed:

```sh
node .codex/local-environment.setup.mjs
```

The script uses `CODEX_WORKTREE_PATH` when Codex provides it, copies the source
checkout's ignored `.env` into a new worktree once, installs the root/mobile and
backend dependency trees, generates Prisma, and writes the ignored `.dev.env`
with stable worktree ports and local secrets.

Configured actions use the ordinary repo scripts:

| Name | Script |
| --- | --- |
| Setup Host | `npm run setup` |
| Prepare Stack | `npm run dev:setup` |
| Dev | `npm run dev` |
| Stop Stack | `npm run dev:down` |
| Stack Status | `npm run dev:status` |
| Migrate DB | `npm run db:migrate` |
| Reset DB | `npm run dev:reset` |
| Test | `npm test` |
| Build | `npm run build` |
| Full CI | `npm run ci:local` |

`npm run dev` builds and starts `web`, `backend`, and `postgres` services for
only the current worktree. Compose Watch syncs source edits into the app
containers. Host checks never need a container shell or a Codex-specific alias.
