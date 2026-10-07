## Summary

A native login can verify a password just before a concurrent password change, then create a session from the stale result. This checkpoint rechecks the verified account and credential version inside the same transaction that creates the native session. Concurrent password changes and deletion therefore happen before issuance, or revoke/remove the session afterward.

Restricted accounts retain their existing recovery access. Local authentication, token formats and lifetimes remain unchanged; Firebase stays disabled. This is a nonclosing partial checkpoint for #421.

Depends on [PR431](https://github.com/MChartier/calibrate-health/pull/431), the shared local credential boundary. Review and merge the parent first; this PR targets its branch. Ultimate target is `master`. PR402 has separate ownership and is not a dependency.

## Test plan and behavior evidence

This is a non-UI security boundary change. The observable contract is whether concurrent operations leave a valid session. [Exact source, complete diff, commands and behavior evidence](https://github.com/MChartier/calibrate-health/blob/6f1e22d2d23ea0b8a4817336a74e7ee411f29dc4/preparation-evidence/atomic-login-a0fdefe8/README.md) are retained outside product history.

| Scenario | Expected and observed behavior |
| --- | --- |
| Credentials change after verification | Login returns the existing generic invalid-credentials response and creates no session; focused local regression passes. |
| Valid or restricted local account | Same user identity and access payload; token return waits for commit. Focused service and route tests pass. |
| PostgreSQL password/deletion race, both orders | A winning mutation blocks stale issuance; a winning issuance is subsequently revoked or cascaded. Both orders passed in CI on disposable PostgreSQL16, with lock waits explicitly observed. |
| Transaction rollback | No tokens returned and no persisted session. Local error-path and real PostgreSQL rollback tests passed. |

## Supporting checks and limitations

Local typecheck and Knip passed; backend tests passed 769 with one explicit database-suite skip because the local Docker daemon is unavailable. CI passed all 775 backend tests with zero skips, including five PostgreSQL scenarios. All five exact-head workflows passed, including mobile/API regression checks; unrelated build/upgrade scenarios retain configured skips. [Configured bot review returned a quota refusal](https://github.com/MChartier/calibrate-health/pull/437#issuecomment-6030076999); no completed bot review is claimed.

No live accounts, provider calls, provisioning, credential changes, production migration, deployment or release. This implements existing SQL deletion ordering only; cross-store pending deletion and the broader Firebase lifecycle remain unfinished. Independent QA is separate.
