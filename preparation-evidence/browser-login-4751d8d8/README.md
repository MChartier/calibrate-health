# Browser password-login atomic persistence

PR442: https://github.com/MChartier/calibrate-health/pull/442
Head: 4751d8d89301c18fb0fed7244c3354477e804c2b
Actual parent/base/merge-base: a0fdefe8bca51c25306f36cccc8181bd35672341 (PR437)
Runtime prerequisite: b3d6559ad8abd1c2725c509357302b1f0e12cdd2 (PR431)
Ultimate master observed: 4cbcbc740fbe5fa5646b4de31951c79a653176d5
Review order: 431, then 437, then 442. Parent and separate-owner PR439 remain unchanged. This is a nonclosing partial checkpoint, not independently mergeable to master.

## Observable contract

The pinned baseline verifies a browser password, then lets Passport regenerate and independently upsert its session. A reset/deletion between those operations can leave a stale newly issued session. At the proposed head, the verified user/version travels in server-only WeakMaps through Passport's real serializer ordering. The first store save conditionally locks the same User/version and inserts its session in one transaction. Reset and SQL deletion contend on that User lock. Subsequent saves of that new object are update-only; rejected objects remain terminal. The route clears authenticated state and the cookie after a failed first save, including cleanup failure.

There is no changed UI flow. The evidence uses actual HTTP responses, real Passport/Express session middleware, and database state. No screenshots or real-provider readiness are claimed. The seven-case maintained fixture and production code are bound by the product commit above; product.diff binds the complete actual-parent comparison.

## Executed behavior

CI job112649671287, run37577522935: all 786 backend tests passed, zero failures or skips. The disposable PostgreSQL16 service ran the seven browser scenarios below (ci-backend.log), plus the parent's five native race/rollback cases. Tests created only UUID-named schemas, applied repository migrations, used synthetic accounts, and dropped their own schemas.

- Reset first: actual resetPasswordWithToken holds the User update lock; login blocks, then returns generic 401; no session exists and a later save fails.
- Deletion first: synthetic SQL User deletion holds the lock; login blocks, then returns generic 401; no session exists and a later save fails.
- Login first, then reset/deletion: the competing writer visibly waits in pg_stat_activity; login commits successfully, then reset deletes or User deletion cascades its row. Later save fails and the returned cookie cannot authenticate a probe request.
- Forced failure before COMMIT after INSERT: HTTP500, no persisted session, and later save fails. This tests rollback, not an ambiguous network failure after commit.
- Restricted login: unchanged integer principal and email_verification_required payload; session JSON contains only cookie/passport. Direct password mutation preserving this row advances the database version; an update-only resave still succeeds and the cookie authenticates. This demonstrates the current-session exception, not a complete password-change HTTP walkthrough.
- Local registration: actual registration route and Passport middleware create the usual integer-principal session without password-login context.

The test's LocalStrategy assembly mirrors the production password lookup/verification/marking; the serializer, session store, login/registration routes and reset service are production imports. SQL deletion is a controlled fixture, not a complete account-deletion endpoint or future cross-store deletion test. Dev-login source remains unchanged; no separate manual dev-login walkthrough was run.

All five exact-head workflows succeeded (ci-runs.json). Mobile tests and unrelated build/upgrade jobs retained their configured path-filter skips; no mobile execution is claimed for this checkpoint.

Local mchartier_zbook / Node24 / isolated atomic-browser-login-421 worktree:
- npm --prefix backend run typecheck: passed (typecheck.log).
- backend node -r ts-node/register --test --test-concurrency=2: 772 passed, zero failed, two explicit PostgreSQL skips (backend.log).
- Focused store/route suite: 28 passed (focused.log).
- npm run knip: passed (knip.log).
Local tests preceded removal of an unused internal-function export; that nonbehavioral change is included in final-head CI. No local PostgreSQL result is claimed because the Docker daemon was unavailable.

## Scope and review

Complete published child history: one commit, seven files, +381/-19. Four production files and three maintained regression files. No one-off logs, harnesses, copies, inventories or evidence receipts enter product history. scope.json lists every changed file and ordered commit/parent identity; product.diff contains the complete comparison. No cleanup deletion or history rewrite was needed.

Configured engineering review completed at the exact head and reported no major issues in comment6031790637. Review state, full comments and inline findings are retained in review.json. Independent readiness QA remains separate; no human-ready label, approval, merge or draft transition occurred. General rendered-PR inspection waiver applies; no fresh browser-render inspection is claimed and no UI evidence waiver is needed.

Issue421 and Project Current PRs link child442, parent437, ancestor431 and merged423. Partial native Development linkage remains the coordinator's separate unresolved decision. No closing keyword was added.

Owner: task01a10cfe-a79f-7198-9e8f-2b4dc6703031. Retention: append-only review evidence on existing nonmerged evidence/issue421-preparation-d8a2ac14, retained for migration review/history; never merge into product. Standards: workflow-v3 f0919b184b6344d6279178b2388190936ca432a9 and pr-review-v3 97e5583c8355f3673aad0835c0ce3ca1486aeb8b plus supplied direct amendments.

No live-account reads, provider calls, provisioning, credential changes, real Firebase rehearsal/import, deployment or release. Firebase stays disabled. Existing sessions gain no blanket version enforcement; broader Firebase runtime/lifecycle and cross-store deletion remain unfinished.
