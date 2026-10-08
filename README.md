# Issue451: dormant account deletion evidence

Source: d4b6d9f8f96226cbe9fdc4530ab0e0c329d7b661. Parent/baseline PR442: 4751d8d89301c18fb0fed7244c3354477e804c2b. Ultimate target master: 9dc0739e36168aa273530fe00ae5f85fb9c8a3fe.
One focused child commit, 23 paths, 883 additions and 23 deletions. [Full inventory and exact log hashes](manifest.json).

The parent immediately deletes SQL accounts and has no cross-store reconciliation. This child adds an internal protocol that atomically accepts a recent identity/version-bound proof, records intent and revokes access; reconciles the exact provider identity outside SQL locks; and completes SQL cleanup with an independent receipt only after confirmed provider absence. Firebase remains disabled, with no production coordinator caller or real adapter.

## Observed behavior

- All **811 backend tests passed**, zero failures/skips, with real disposable PostgreSQL. Browser/native issuance, reset and older MCP/Wear writers were tested in both transaction orders. A deliberately conflicting old session writer caused a PostgreSQL abort; retry could not restore pending access.
- Actual child processes were killed after intent, synthetic provider success and completion. The same durable operation resumed with its receipt intact. Synthetic provider state persisted independently of SQL.
- Timeouts, lost responses, wrong identity, stale worker claims and final SQL commit failure could not prematurely remove SQL data. A delete that timed out after remote synthetic success reconciled on retry.
- Populated upgrade retained core data through all **49 migrations**. Guarded schema rollback/re-upgrade preserved an ordinary local account and owned data before any intent; rollback refused accepted receipts. **14 rollback-helper tests passed.** Docker encrypted-backup rehearsal was not run locally because the Linux engine was unavailable; the existing hosted CI gate remains required.
- Existing local registration/recovery/deletion, restricted access and the current-session password-change exception passed the full backend regressions. No mobile/UI changes; non-UI observable contract applies. Synthetic results are not a real Firebase rehearsal.

## Reproduction and provenance

Windows mchartier_zbook, Node24.19.0, isolated PostgreSQL16.14, October8 2026. Locked dependencies installed without manifest changes. Only loopback database calibrate_test451 and unique per-suite schemas were used. The owned database server was stopped afterward. No live accounts/provider calls, credentials, provisioning, deployment or release.

From backend with CALIBRATE_AUTH_TEST_DATABASE_URL set to a disposable loopback calibrate_test database:
- npm test: [811 passed](backend-final.log).
- node -r ts-node/register --test test/account-deletion-postgres.test.js test/account-deletion.test.js: [focused 25 passed](deletion-final.log).

From repository root:
- npm run lint: [all workspace typechecks](lint.log).
- npm run test:dead-code: [normal and production checks](dead-code.log).
- node --test scripts/postgres-rollback-smoke.test.mjs: [14 passed](rollback-unit.log).
- Set DATABASE_URL to the same disposable database; node scripts/postgres-populated-upgrade-smoke.mjs: [49-migration upgrade](populated-upgrade.log).

The full backend log binds the final source tree. The focused log preceded the final Knip-boundary assertion and equivalent shared minute-constant reuse; full backend execution passed afterward. Typecheck preceded those test/config-only edits and equivalent constant reuse; exact-head hosted lint remains required. Knip passed with the final production-only exclusion, before equivalent shared-constant import. These observations are not relabeled as later executions.

## Scope and limitations

Schema/SQL guards, coordinator, pending-access predicates, maintained tests and one maintained contract document implement451. Three existing rollback-helper candidate-ledger values and two expectations track the required migration; release commands/workflows are unchanged. Knip excludes only this intentionally dormant file from its production graph; normal analysis and the production-import prohibition test remain active. Product history has no logs, capture harnesses or evidence archives.

No receipt purge policy, runtime activation, public pending API, client cleanup, real provider adapter, registration orchestration, external event ingestion or cutover is supplied. Independent engineering review and readiness QA remain separate gates. This checkpoint does not complete421.
