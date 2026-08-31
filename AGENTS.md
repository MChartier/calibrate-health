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
- Baseline daily target is `TDEE - daily_deficit`.
- A user-approved calibration revision may add a bounded target correction while
  leaving the configured deficit and profile-estimated TDEE unchanged.
- Projection uses a constant rate of `3500 kcal/lb` or `7700 kcal/kg`.
- "Calories out" remains the profile-estimated TDEE. Weight and intake trends
  may support a bounded calorie-target correction, but must not replace or be
  displayed as the user's TDEE.

Non-goals for MVP:

- No activity-driven automatic calorie-target adjustment.
- No smart deficit adjustment to hit a target date.
- No advanced body composition modeling beyond optional stored fields.

## Architecture Map

- Client: Expo Router + React Native + React Native Web, TypeScript, React Query.
- Backend: Node.js + TypeScript + Express.
- Persistence: Postgres through Prisma under `backend/prisma/`.
- Shared domain constants live under `shared/`.
- Browser and native routes live under `mobile/app/`; shared client code lives
  under `mobile/src/`.
- Supported server-side language values live in `backend/src/utils/language.ts`.
- Food providers live in `backend/src/services/foodData/`.
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
- Keep Codex and validation commands on the host. Use the repo-owned Compose
  launcher for the live application stack; do not add container-shell wrappers
  for ordinary tests, linting, builds, or Prisma work.

## Local Development

Primary workflows:

- Codex setup: `node .codex/local-environment.setup.mjs`
- Host dependency setup: `npm run setup`
- Prepare the worktree stack: `npm run dev:setup`
- Local dev server: `npm run dev`
- Native Expo dev-client bundler: `npm run dev:expo` (with the Compose stack
  running separately)
- Local dev without seeded-user auto-login: `npm run dev:manual-auth`
- Inspect the current stack: `npm run dev:status`
- Reset test-user onboarding: `npm run dev:reset-test-user-onboarding`
- Local CI equivalent: `npm run ci:local`

Worktree stack notes:

- `scripts/dev-stack.mjs` owns Docker/Compose lifecycle, stable ports, and the
  current worktree database. It always targets the current checkout.
- `scripts/dev-env.mjs` owns host dependency setup, Prisma commands, and local
  CI. Host dependency caches are lockfile-and-runtime based; keep cache-hit and
  cache-miss output explicit when editing setup.
- `compose.dev.yaml` runs separate `web`, `backend`, and `postgres` services.
  Compose Watch syncs source changes; package-lock and Prisma changes rebuild
  the affected image.
- Codex setup installs host dependencies and allocates `.dev.env`, but it does
  not start containers. This prevents idle stacks in code-only worktrees.
- `npm run dev:down` retains the current database volume. `npm run dev:reset`
  resets only that worktree's database.
- Repo root `.env` is gitignored. Do not assume it propagates to new worktrees
  unless setup copies it or the user sets machine/user environment variables.

Environment conventions:

- Root `.env` stores user-provided application credentials.
- `.dev.env` is generated, gitignored, worktree-specific, and contains only the
  allowlisted application configuration plus local ports/secrets.
- Direct backend package runs may use `backend/.env`; standard root database
  commands inject the current worktree database automatically.
- The seeded account is `test@calibratehealth.app`.
- `AUTO_LOGIN_TEST_USER=true` enables local auto-login for that seeded account.

## Validation

Choose validation proportional to the change, and report what ran.

Common checks:

- Full local CI: `npm run ci:local`
- All TypeScript surfaces: `npm run lint`
- Backend type-check: `npm --prefix backend run typecheck`
- Shared API client type-check: `npm --prefix packages/api-client run typecheck`
- Expo client type-check: `npm --prefix mobile run typecheck`
- Expo web build: `npm run build:expo-web`
- Expo client tests: `npm --prefix mobile test`
- Expo web release checks: `npm run test:expo-web:release`
- Backend tests: `npm --prefix backend test`
- Backend build: `npm --prefix backend run build`
- Audit from the root/mobile dependency context: `npm audit`
- Diff hygiene: `git diff --check`

Windows-specific note:

- Use `npm.cmd --prefix mobile run typecheck`, `npm.cmd --prefix mobile test --
  --runInBand`, and `npm.cmd --prefix mobile run build:web` when an issue or
  reviewer calls for the Windows-host Expo gates.

Client dependency/audit fixes:

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
- Keep FatSecret attribution intact in client search/barcode results. The Expo
  barcode path is implemented through `mobile/src/barcode/workflow.ts`.
- Profile photos are stored inline as small processed avatars; respect
  `backend/src/utils/profileImage.ts` caps and parsing rules.
- Prisma migrations use ordinal folder names such as `0001_init`. If
  `prisma migrate dev` creates timestamped local folders, rename them to the
  ordinal style before sharing if they are still unapplied elsewhere.

Food provider behavior:

- `FOOD_DATA_PROVIDER` selects the preferred provider: `fatsecret`, `usda`, or
  `openfoodfacts`.
- FatSecret requires `FATSECRET_CLIENT_ID` and `FATSECRET_CLIENT_SECRET`.
- USDA requires `USDA_API_KEY`, though local development may use USDA `DEMO_KEY` for
  local fallback when no provider credentials exist.
- Missing credentials should not crash normal dev search. Detect available
  providers and use deterministic fallback order with the configured/default
  provider first.
- Keep provider identity stable across paginated text-search results. Do not
  switch providers on later empty pages if the client is appending results
  under first-page provider metadata.
- Do not merge provider results unless explicitly requested; the validated shape
  is sequential fallback.

## Expo Client Practices

- Keep browser and native behavior in the shared Expo source tree. Use matching
  `.web` and `.native` modules or the contracts under `mobile/src/platform/`
  when behavior must differ by runtime.
- Keep primary Expo Router navigation fast. Treat route splitting and deferred
  bundles as release behavior that requires browser and device validation.
- Preserve the app-like PWA experience. PWA toasts should be actionable: offline,
  back-online, update-ready, and update-failed are appropriate; lifecycle-only
  "ready for offline launch" messaging is not.
- Runtime PWA state should use React-safe external-store patterns such as
  `useSyncExternalStore` rather than setting component state from service-worker
  effects.
- Installed-app polish belongs in the Expo app shell. `mobile/app/_layout.tsx`,
  `mobile/app/_layout.web.tsx`, and `mobile/app/(tabs)/_layout.tsx` own global
  providers, browser shell behavior, and tab navigation.
- Keep mobile navigation focused. Do not reintroduce redundant profile/"More"
  bottom-nav entry points when top app-bar/account-menu access is sufficient.
- For public/auth/onboarding/account surfaces, keep one cohesive layout language
  across adjacent pages instead of polishing one page in isolation.
- Reuse the auth primitives under `mobile/src/components/auth/` for
  login/register shell work.
- Use `mobile/src/components/AppCard.tsx` and existing screen/card primitives
  where they fit. If card hover or click treatment feels inconsistent, compare
  sibling components before making one-off changes.
- Keep generic primitives under `mobile/src/components/`; put feature-specific
  behavior in the corresponding `mobile/src/` feature folder.
- Keep public privacy and account-deletion copy centralized in
  `mobile/src/legal/publicLegalContent.ts`.
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

## Release Versioning

- Ordinary feature and fix PRs must not change `shared/release.json` `server.version` or its package, lockfile,
  diagnostic, OpenAPI, and generated-client mirrors.
- After the desired changes land on `master`, run **Cut release** in GitHub Actions and choose `patch`, `minor`, or
  `major`. The action owns the synchronized release commit, version-only PR, tag, and GHCR publication.
- The visible server release Actions are read-only request workflows. Protected-default-branch `workflow_run` handlers
  call reusable workers, while every ordinary `GITHUB_TOKEN` remains read-only. Git/master/stable-tag writes use only
  the restricted Server Release GitHub App in the master-only, reviewer-protected `server-release-publication`
  environment. GHCR uses a separate package-only robot credential in that environment on a fresh publisher runner;
  the source repository must have no inherited or Actions write access to the package. Missing environment/App/PAT or
  ruleset/package onboarding intentionally leaves publication unavailable. The sole GitHub-native write exception is
  the source-free image-receipt signer, which receives only OIDC plus `attestations: write` and runs the full-SHA-pinned
  attestation action before package authentication. An existing `v*`/`sha-*` image is authoritative only when its
  exact linux/amd64 config digest reconstructs the release receipt and that receipt verifies against the exact signer
  workflow/source identity. An earlier protected-master signer remains valid automatically only while its critical
  image workflow/verifier blobs are byte-identical, or when it is the exact post-hardening parent of the canonical Cut
  release commit. Current protected master owns exceptional retention and revocation through exact `allow SHA` and
  `revoke SHA` directives in `.github/release-image-attestation-trusted-workflow-shas`; `revoke SHA` overrides every
  automatic rule. Keep changed signers allowed for the full supported recovery window. Never adopt legacy or
  prepositioned aliases without that evidence, and inventory/quarantine/delete pre-attestation aliases before enabling
  the package robot. GitHub's attestation service is an integrity authority, not an availability guarantee: the
  verifier raises its bounded lookup limit, but missing/deleted/flooded legitimate evidence still fails closed and
  requires an audited alias quarantine/delete plus fresh publication.
- GitHub environment approval is per job. A normal **Cut release** requires four sequential
  `server-release-publication` approvals: candidate publication, validated merge, stable tag creation, and GHCR
  publication. A pre-finalize validation failure takes candidate plus cleanup approvals; a finalize failure after its
  approval takes candidate, finalize, then cleanup, and cleanup is eligible only after read-only exact-ref inspection.
  **Publish prepared release** requires tag and image approvals, and **Build Release Image** requires one image
  approval. The first three normal Cut checkpoints use
  the same restricted Server Release App capability; the image checkpoint uses the distinct package-only robot.
- **Cut release** revalidates exact metadata and runs a production-image smoke only. Affected pull-request and scheduled
  workflows own full tests, dependency and vulnerability checks, and database upgrade/rollback validation.
- If `master` advances while a candidate is validating, rerun **Cut release**. Do not rebase or manually repair the
  generated release branch.
- Android phone and Wear versions remain independent of the server/web release selector. Their Play version codes are
  globally unique: phone uses the odd lane and Wear uses the even lane. Use `release:native:prepare` for a paired
  store version only after its current manifest tag is verified as a signed annotated tag against the reviewed public
  keys in `.github/native-release-tag-allowed-signers`, the exact tag name and target SHA, the exact published `origin`
  tag, and `origin/master` ancestry; local-only, lightweight, unsigned, wrong-key, or wrong-target tags are not release
  evidence. Merge it, then run **Native Android Store Release** with the exact full merge commit. It builds once,
  uploads phone/Wear to Play internal tracks, and promotes those exact codes through closed testing before the
  protected production operation.
- Before Play upload, a separate source-free job with the workflow's only native Play OIDC/attestation-write scope
  attests canonical repository/app/source/tag/version and phone/watch track/code/AAB-hash receipt bytes. The Play
  publisher must independently reconstruct and verify that exact receipt before authentication. Recovery must derive
  identical bytes solely from singleton Play observations, scrub Play authentication, then verify the original exact
  workflow/source certificate under the fresh-master allow/revoke policy. A mutable Play name is not provenance;
  missing/legacy/revoked evidence requires a fresh higher odd/even pair, never adoption or tag creation.
- After the GHCR image is published, **Cut release** publishes the exact release commit to Expo only when the native
  tag from `shared/release.json` is a verified signed release attestation. Expo publication uses four separately
  approved, source-free credential jobs: resolve internal environment, publish internal, resolve production
  environment, and publish production. The single Expo token has project-wide update authority; the later approvals
  enforce reviewed workflow sequencing but are not a channel-scoped capability boundary. The pinned public key,
  exact annotated-tag name, and exact peeled target verification must be
  used consistently by prepared-release OTA readiness, Play promotion, and origin-authoritative native preparation;
  a commit signature is insufficient. A reserved
  but unpublished native tag skips OTA without failing the independent server/image release; rerun the prepared
  release or use the manual OTA workflow after the signed native baseline is published. It never waits for or triggers
  self-host deployment.
- Keep `native-release-attestation` and its tag-signing private key isolated from Play credentials and from the
  `native-release-tags` GitHub App push credential. Verifier code stays pinned to the reviewed workflow SHA, while
  every run and rerun obtains and logs the allowed-signers trust set from the exact current protected `master` commit
  so revocation cannot be undone by rerunning an old workflow. The reviewed allowed-signers file is the trust root; its
  comment-only placeholder intentionally fails closed until onboarding. Tag rulesets are defense-in-depth, not the sole
  attestation boundary, because the read-only Rulesets API hides bypass actors. Rotate with overlapping old/new public
  keys, then switch the workflow secret, verify a new-key tag, and remove the old key only after dependent baselines
  retire; suspected compromise requires an immediate pause, private-key removal, public-key revocation, tag/Play audit,
  and a higher native version rather than moving an existing tag.
- Expo's automatic check and download lifecycle remains native-owned. Client code compares only the running bundle's
  expected server contract version with client configuration at startup and server selection. Major versions must
  match; within a major, the server minor must be at least the client minor, while patch drift remains compatible. Do
  not add candidate-manifest inspection or a download/restart veto.
- Startup, server-selection, and manual-recheck compatibility requests must use `cache: 'no-store'`; response headers
  alone cannot invalidate a response cached before the server began sending the no-store policy.
- Protected production approval is the current public-channel promotion gate. A future explicit readiness signal may
  cover the release owner's declared server rollout, but independent self-hosts still require the runtime guard. Do
  not poll private servers from CI.
- Use **Publish prepared release** with the recorded release commit and branch to recover post-merge tag/image
  failures and OTA failures whose prepared manifest already records a compatible protected native tag. Historical releases
  with an incompatible recorded native baseline require **Publish Expo OTA Update** from an exact compatible source
  that descends from the installed build. **Build Release Image** remains an image-only recovery tool.

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
