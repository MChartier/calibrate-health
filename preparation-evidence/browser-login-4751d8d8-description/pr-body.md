## Summary

Browser password login can verify credentials just before a concurrent password reset or account deletion, then save a session from that stale result. This checkpoint checks the verified account and credential version in the transaction that first persists Passport's regenerated session. Rejected saves are terminal; later saves of an accepted login can only update its existing row.

Integer identity, cookie format, restricted recovery access, local registration and dev login retain their existing behavior. Firebase stays disabled. This is a nonclosing partial checkpoint for #421.

Depends on [PR437](https://github.com/MChartier/calibrate-health/pull/437), after [PR431](https://github.com/MChartier/calibrate-health/pull/431). Review and merge in that order, then this PR; ultimate target is `master`. PR439 has separate ownership and is not imported.

## Test plan and behavior evidence

This is a non-UI session-persistence change. Real Passport/Express HTTP responses and durable session state establish the contract. [Exact source/base, complete diff, maintained fixtures and execution evidence](https://github.com/MChartier/calibrate-health/blob/0b80eb0888aee62ed264a3e4d94843520ac191a9/preparation-evidence/browser-login-4751d8d8/README.md) are retained outside product history.

| Scenario | Expected and observed behavior |
| --- | --- |
| Reset or deletion wins before save | Login returns generic 401, leaves no session, and rejects later saves. Both real PostgreSQL races passed with lock waits observed. |
| Login saves first | Later reset/deletion removes its row; resaving cannot recreate it and its cookie cannot authenticate. Both orders passed. |
| Persistence rolls back | HTTP500, no durable session, and later save rejected. Real database rollback test passed; local cleanup-failure test also passed. |
| Restricted login and local registration | Integer principal and access payload preserved; session JSON contains no verification context. Real HTTP tests passed. A direct password mutation retaining the current row still permits its update-only save. |

## Supporting checks and limitations

All five exact-head CI workflows passed. Backend: 786 passed, zero failures/skips, including seven new PostgreSQL scenarios. Unrelated mobile/build/upgrade jobs retain configured path-filter skips. Local typecheck and Knip passed; local backend tests passed 772 with two explicit database-suite skips because the local Docker daemon was unavailable. [Configured engineering review completed without major findings](https://github.com/MChartier/calibrate-health/pull/442#issuecomment-6031790637). Independent readiness QA remains separate.

Deletion uses the existing SQL lifecycle; the current-session exception test is not a full password-change HTTP walkthrough. Existing sessions gain no blanket version checks. No live accounts, provider calls, provisioning, real Firebase rehearsal/import, deployment or release occurred. Broader Firebase runtime/lifecycle work and the parent's partial-linkage decision remain unfinished.
