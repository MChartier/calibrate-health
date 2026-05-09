# calibrate Agent Guide

This file is for AI/code agents working in this repo. Keep changes aligned with
the product shape, current architecture, and the workflow conventions that have
already been validated here.

## Product Contract

calibrate is a responsive calorie tracker for desktop and mobile web. Users log
food and weight, then compare daily calorie intake with an estimated target from
their profile and goal.

Core requirements:

- Multi-user email/password auth with cookie sessions.
- Required profile data for calorie math: date of birth or age, sex, height,
  current weight, timezone, unit preference, language, and activity level.
- Goal setup with start weight, target weight, and signed `daily_deficit`.
- Allowed daily deficit/surplus magnitudes are defined in `shared/goalDeficit.ts`
  and must remain `0`, `250`, `500`, `750`, `1000` kcal/day.
- Positive `daily_deficit` means deficit/weight loss. Negative means surplus/
  weight gain. `0` means maintenance.
- Food logging is organized by fixed meal periods: Breakfast, Morning Snack,
  Lunch, Afternoon Snack, Dinner, Evening Snack.
- Weight and food "day" grouping must follow the user's IANA timezone, not the
  server timezone.
- Visualization should support calories consumed vs target, weight trend, and
  steady-rate goal projection. Maintenance goals do not show a projection date.

Calorie math:

- BMR uses Mifflin-St Jeor.
- TDEE is `BMR * activityMultiplier`.
- Daily target is `TDEE - daily_deficit`.
- Projection uses a constant rate of `3500 kcal/lb` or `7700 kcal/kg`.
- Do not infer expenditure from weight changes for MVP; "calories out" is the
  profile-estimated TDEE.

Non-goals for MVP:

- No native mobile app.
- No automatic activity import.
- No smart deficit adjustment to hit a target date.
- No advanced body composition modeling beyond optional stored fields.

## Architecture Map

- Frontend: React + TypeScript + Vite, MUI, React Query.
- Backend: Node.js + TypeScript + Express.
- Persistence: Postgres through Prisma under `backend/prisma/`.
- Shared domain constants live under `shared/`.
- Localization strings live in `frontend/src/i18n/resources.ts`; supported
  language lists live in `frontend/src/i18n/languages.ts` and
  `backend/src/utils/language.ts`.
- Food providers live in `backend/src/services/foodData/`.
- The dev-only dashboard at `/dev` compares food providers and supports barcode
  scanning tests.
- Self-hosting uses `deploy/` and expects an external Postgres unless a deployer
  explicitly adds one.

## Agent Operating Defaults

- Read the relevant code before proposing changes. Prefer existing patterns over
  new abstractions.
- If the user asks for a fix, upgrade, rebase, issue update, audit pass, or UI
  overhaul, implement it directly when feasible.
- Keep repo-owned workflows first. Prefer tracked scripts, Codex actions, and
  documented commands over one-off local instructions.
- Preserve disposable worktree and Codex app workflows. Do not steer back to
  static worktrees or CLI-only operation unless the app workflow is blocked.
- Treat Windows-host execution as a first-class path. Host-side scripts should
  use Node entrypoints rather than shell assumptions when practical.
- When diagnosing setup failures, start from the exact failing command/log and
  verify the repo-owned setup path before changing app code.
- Keep secrets out of the database. Provider API keys and client IDs are sourced
  from environment variables unless the product direction changes explicitly.
- For commands that need to run inside the devcontainer from the host, prefer the
  worktree-aware helpers:
  - `npm run devcontainer:up -- <branch|path>`
  - `npm run devcontainer:exec -- -- <command...>`
  - `npm run devcontainer:shell -- <branch|path>`
  - `npm run codex:<action>` when using Codex app actions.

## Local Development

Primary workflows:

- Codex setup: `node .codex/local-environment.setup.mjs`
- Codex dev action: `npm run codex:dev`
- Codex setup action: `npm run codex:setup-app`
- Codex shell: `npm run codex:shell`
- Local dev server: `npm run dev`
- Local dev with seeded test-user auto-login: `npm run dev:test`
- Reset test-user onboarding: `npm run dev:reset-test-user-onboarding`
- Storybook: `npm run dev:storybook` or `npm run codex:storybook`
- Local CI equivalent: `npm run ci:local`

Devcontainer notes:

- The devcontainer intentionally starts quickly. Run setup when dependencies,
  Prisma generation, migrations, or seed data are needed.
- `scripts/dev-env.mjs` is the supported dependency/setup orchestrator.
  `setup:deps` repairs dependency volumes; `setup` installs dependencies,
  generates Prisma, waits for DB readiness, migrates, and seeds.
- Dependency caches are lockfile-and-runtime based. Keep cache-hit/cache-miss
  output explicit when editing setup scripts.
- A healthy backend dependency volume contains `backend/node_modules/.bin/prisma`,
  `backend/node_modules/.bin/ts-node`, and
  `backend/node_modules/.calibrate-install-complete.json`.
- If Prisma disappears inside the container, rerun the repo setup/deps path
  before treating it as an app regression.
- Repo root `.env` is gitignored. Do not assume it propagates to new worktrees
  unless setup copies it or the user sets machine/user environment variables.

Environment conventions:

- Devcontainer and docker-compose read repo root `.env`.
- Local backend runs outside the devcontainer use `backend/.env`.
- `.devcontainer/.env` is generated and gitignored.
- The seeded account is `test@calibratehealth.app`.
- `AUTO_LOGIN_TEST_USER=true` enables local auto-login for that seeded account.

## Validation

Choose validation proportional to the change, and report what ran.

Common checks:

- Full local CI: `npm run ci:local`
- Frontend lint: `npm --prefix frontend run lint`
- Frontend build: `npm --prefix frontend run build`
- Frontend tests: `npm --prefix frontend test`
- Backend tests: `npm --prefix backend test`
- Backend build: `npm --prefix backend run build`
- Storybook build: `npm --prefix frontend run storybook:build`
- Audit from frontend dependency context: `npm --prefix frontend audit`
- Diff hygiene: `git diff --check`

Windows-specific note:

- Existing issue validation may name `npm.cmd --prefix frontend run lint` and
  `npm.cmd --prefix frontend run build`. Use those exact commands when the issue
  or reviewer calls them out.

Frontend dependency/audit fixes:

- Keep remediation narrow. Prefer lockfile-only or targeted override fixes when
  they address the advisory.
- After lockfile-only work, run a full install if `eslint`, `tsc`, or other local
  binaries are missing before trusting lint/build results.

## Data And Domain Rules

- Store weights in grams and heights in millimeters; convert at API/UI edges.
- Store `FoodLog.local_date`, `FoodLogDay.local_date`, `BodyMetric.date`, and
  notification local dates as date-only values derived from `User.timezone`.
- Use shared timezone helpers for local-day calculations. Avoid duplicating date
  math or relying on server-local time.
- Food logs are immutable snapshots. My Foods and recipe edits must not
  retroactively mutate existing `FoodLog` entries.
- Preserve external provider and serving snapshot fields when editing food logs.
- Keep FatSecret attribution intact via
  `frontend/src/components/FatSecretAttributionLink.tsx` whenever FatSecret is
  active.
- Profile photos are stored inline as small processed avatars; respect
  `backend/src/utils/profileImage.ts` caps and parsing rules.
- Prisma migrations use ordinal folder names such as `0001_init`. If
  `prisma migrate dev` creates timestamped local folders, rename them to the
  ordinal style before sharing if they are still unapplied elsewhere.

Food provider behavior:

- `FOOD_DATA_PROVIDER` selects the preferred provider: `fatsecret`, `usda`, or
  `openfoodfacts`.
- FatSecret requires `FATSECRET_CLIENT_ID` and `FATSECRET_CLIENT_SECRET`.
- USDA requires `USDA_API_KEY`, though devcontainers may use USDA `DEMO_KEY` for
  local fallback when no provider credentials exist.
- Missing credentials should not crash normal dev search. Detect available
  providers and use deterministic fallback order with the configured/default
  provider first.
- Keep provider identity stable across paginated text-search results. Do not
  switch providers on later empty pages if the frontend is appending results
  under first-page provider metadata.
- Do not merge provider results unless explicitly requested; the validated shape
  is sequential fallback.

## Frontend Practices

- Keep primary SPA route navigation fast. Do not lazy-load main dashboard/app
  routes just to reduce bundle warnings unless the user explicitly accepts the
  first-click latency tradeoff.
- For bundle-warning work, prefer config/tooling fixes, explicit warning limits,
  preloadable chunks, intent-based prefetch, or selective splitting of uncommon
  features.
- Preserve the app-like PWA experience. PWA toasts should be actionable: offline,
  back-online, update-ready, and update-failed are appropriate; lifecycle-only
  "ready for offline launch" messaging is not.
- Runtime PWA state should use React-safe external-store patterns such as
  `useSyncExternalStore` rather than setting component state from service-worker
  effects.
- Installed-app polish belongs in the app shell. `Layout.tsx` owns top/bottom
  navigation, window-controls-overlay spacing, account-menu entry points, and
  global PWA status UI.
- Keep mobile navigation focused. Do not reintroduce redundant profile/"More"
  bottom-nav entry points when top app-bar/account-menu access is sufficient.
- For public/auth/onboarding/account surfaces, keep one cohesive layout language
  across adjacent pages instead of polishing one page in isolation.
- Reuse `frontend/src/components/auth/AuthPageFrame.tsx` for login/register
  shell work.
- Use `AppCard` and existing page/card primitives where they fit. If card hover
  or click treatment feels inconsistent, compare sibling components before
  making one-off changes.
- Keep `frontend/src/ui/` focused on generic primitives; put feature-specific
  components under `frontend/src/components/` or a feature folder.
- Visible copy changes require synchronized keys across all supported languages
  in `frontend/src/i18n/resources.ts`.
- Prefer ASCII punctuation in UI strings (`|`, `-`, `...`) over bullets,
  ellipses, or curly punctuation.

UI code style:

- Avoid magic numbers for layout/styling. Prefer named constants, theme tokens,
  or wrapper presets.
- Add a short comment to new layout/motion constants explaining what they
  control.
- Keep JSX readable. Move heavy `sx` logic, one-of-N render branches, and state
  to label/variant mappings into named variables or helpers.
- Avoid nested ternaries. Use `if`/`switch` when mapping state to UI text,
  variants, or render branches.
- Use shared constants/enums for domain string unions used in comparisons or
  `<Select />` values.
- Deduplicate repeated enum-to-label/icon/color mappings into shared utilities
  when reused.
- Prefer shaped loading placeholders that keep stable UI chrome rendered.
- Encapsulate animation math/state in small helpers or hooks and respect
  `prefers-reduced-motion`.
- Remove unused wrapper props/types rather than carrying speculative API
  surface.

## Backend/API Practices

- Prefer explicit request parsing and response serialization helpers with typed
  wire shapes, especially around Date fields.
- Preserve Prisma datasource query parameters such as `schema` when refactoring
  database URL or `DB_*` connection plumbing.
- Use explicit environment helper names, such as production or staging, instead
  of ambiguous terms like production-like.
- When deployed and local-dev behavior intentionally differ, include a concise
  why comment.
- Make warnings actionable: include the consequence and the next env var or
  config step.
- Avoid duplicated time constants. Prefer shared exported duration constants for
  common day/week/session TTL math.
- When changing indexes or schema shape, inspect route/service query patterns
  first and model/index for those actual access paths.
- Close both Prisma and adapter-owned `pg.Pool` connections in scripts/tests
  that need deterministic shutdown.

## Git And PR Workflow

- Local default branch is `master`.
- For "rebase onto latest local master" requests, use local `master`, not
  `origin/master`, unless the user says otherwise.
- If a branch backs an existing PR, preserve that PR and update the branch in
  place. Use `git push --force-with-lease` after a successful published-branch
  rebase.
- If a detached worktree has changes, stash with untracked files before rebasing
  and restore afterward.
- For metadata-only PR updates, edit only the requested PR metadata and preserve
  draft/ready-for-review state.
- When a PR maps to a tracked issue, add the appropriate close keyword to the PR
  body unless it is already present.
- For publish requests, prefer a local branch under the project/user branch
  prefix, commit only intended files, push, and open a draft PR by default unless
  the user asks for ready-for-review.

## Documentation Style

- Keep comments concise and useful: explain intent, behavior, or rationale that
  is not obvious from the code.
- Do not add broad narrative comments or duplicate what a function name already
  says.
- Keep agent guidance and README/docs in sync when workflow commands change.
- Prefer concrete commands and exact files over abstract cleanup advice.
