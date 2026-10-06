## Summary

Preparing existing accounts for Firebase must preserve password access across browser/native login, account changes and MCP authorization. The current runtime has no shared credential-verification boundary for that preparation. This checkpoint introduces that boundary while preserving local authentication, caller-owned validation, authorization and session issuance.

Firebase remains disabled. No account IDs, data ownership, session formats, offline behavior or database schema change. Related to #421; this bounded checkpoint does not complete or close the migration. Base: `2d7a4f659d8d1a8d27cfb4210db1bbe22b3e536b`. No unmerged parent dependency; earlier preparation PR423 is merged.

## Test plan and behavior evidence

This is a non-UI runtime refactor; there is no changed visual flow. [Source-bound inputs, complete diff, test output and limitations](https://github.com/MChartier/calibrate-health/blob/9b22a1c9714e5ca6a3dfed7769d57c0f81c6b3d1/preparation-evidence/credential-runtime-b3d6559a/README.md) are retained outside the product diff.

| Scenario | Intended behavior and observation |
| --- | --- |
| Local account or unknown-account password comparison | Valid bcrypt credentials remain valid; unknown accounts do a dummy comparison and never authenticate. Real bcrypt regression tests pass. Existing reauthentication byte handling is preserved; MCP retains its explicit byte limit. |
| Browser/native login, password change/deletion and MCP approval | Existing route/service tests exercise the shared helper while retaining account lookup, access checks and session/security-version guards. All 765 backend tests passed on the proposed head. |
| Injected synthetic Firebase adapter | Wrong project or incomplete mapping makes no request; bad credentials remain distinct from retryable provider failure; forged claims and hanging transport/verifier fail closed. These tests do not establish real Firebase readiness. |

## Supporting checks and limitations

Backend typecheck and Knip passed locally. All 765 backend tests passed. All five exact-head CI workflows passed; unrelated mobile/device and database-upgrade scenarios were skipped by the existing path classifiers. [Configured engineering review returned a quota refusal](https://github.com/MChartier/calibrate-health/pull/431#issuecomment-6021318904); no completed bot review is claimed. No Firebase project, credentials, import rehearsal, live-user data, deployment or release was used. Real-provider integration and full account lifecycle migration remain future work. Independent readiness QA has not run for this checkpoint.
