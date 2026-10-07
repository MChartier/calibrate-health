# Atomic native login: source and behavior evidence

PR437: https://github.com/MChartier/calibrate-health/pull/437
Head: a0fdefe8bca51c25306f36cccc8181bd35672341
Parent / actual target / merge-base: b3d6559ad8abd1c2725c509357302b1f0e12cdd2 (PR431, mchartier/credential-verification-421)
Ultimate master observed: 4cbcbc740fbe5fa5646b4de31951c79a653176d5
Review order: PR431 before PR437. Parent remained open and unchanged; this is not independently mergeable to master. PR402 is not a dependency and was untouched.

## Observable contract

Baseline source verifies the native password and then independently reads User and creates MobileAuthSession in Promise.all. Proposed source captures the credential-security version with the verified password; the login-specific issuer conditionally updates that same User/version, reads current account payload, and creates the session in one transaction. Existing database password trigger advances the version; deletion competes for the same User lock. Tokens are returned only after commit. Unknown/wrong/stale credentials retain the generic login error. Restricted accounts retain recovery-capable sessions, not MCP's full-access-only rule.

No UI change applies. No application screenshot or real Firebase claim is made. Future cross-store pending deletion has no schema/runtime implementation here; only existing SQL deletion ordering is covered.

## Executed behavior

Local Windows mchartier_zbook, Node24, isolated atomic-native-login-421 worktree:
- npm --prefix backend run typecheck: pass (typecheck.log).
- backend node -r ts-node/register --test --test-concurrency=2 test/mobile-auth.test.js test/routes-auth-mobile.test.js test/mobile-session-issuance-postgres.test.js: 30 pass, 1 explicit PostgreSQL skip (focused.log).
- backend node -r ts-node/register --test --test-concurrency=2: 769 pass, 1 explicit PostgreSQL skip (backend.log).
- npm run knip: exit0 (knip.log).
- Local Docker unavailable (missing dockerDesktopLinuxEngine pipe); no local database result claimed.

GitHub backend CI job112611401048, run37565258344, exact product head: 775 pass, 0 failures/skips (ci-backend.log). PostgreSQL16 disposable service; maintained test creates a UUID schema, applies repository migrations, uses synthetic users/post-verification snapshots, and drops only that schema. It explicitly observes pg_stat_activity lock waits. Password mutation fixture uses the existing User password-update plus session-revocation operations; it is not an end-to-end reset-link UI test.

Five real-database subtests passed: password commits first prevents session; issuance first is subsequently revoked; deletion first prevents session; issuance first is subsequently cascaded; forced rollback after creation leaves no session/tokens. Existing full backend tests cover refresh/replay, Wear and account/session behavior. All five workflows succeeded, including mobile/API tests; unrelated build/database-upgrade scenarios retain configured skips. Exact workflow identities are in ci-runs.json.

## Scope and limitations

Complete published child range: one commit, six files, +195/-3. Two runtime files, three maintained regression files and two lines enabling the explicit test database in existing CI. No logs, capture harnesses, copied source or receipts in product history. product.diff and scope.json bind all changed paths and ordered commit/parent identities.

Configured Codex review requested once; quota refusal6030076999. Not completed bot review. Independent QA remains separate under the existing quota exception. No human-ready/draft transition or merge performed.

Issue421 and Project Current PRs link child437 and parent431, preserving merged423 history and the verified owner task. These remain nonclosing partial checkpoints; native Development/partial-issue linkage is still the coordinator's unresolved decision and is not silently resolved here.

Owner: task01a10cfe-a79f-7198-9e8f-2b4dc6703031. Purpose/retention: exact review evidence retained on existing nonmerged issue421 evidence branch for migration history; never merge into product. Pins workflow-v3 f0919b184b6344d6279178b2388190936ca432a9 and pr-review-v3 97e5583c8355f3673aad0835c0ce3ca1486aeb8b plus supplied direct amendments. No live-user/provider access, provisioning, credentials, production migration, deployment or release.
