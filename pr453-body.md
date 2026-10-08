## Summary

Future Firebase account deletion spans two stores, but the current SQL deletion has no durable way to recover an interrupted provider operation. This checkpoint adds an internal deletion coordinator that retains account data until provider absence is confirmed, then completes SQL cleanup and a surviving receipt together.

Recent authentication binds intent to the existing account, immutable provider identity and security version. Pending intent revokes access atomically; retries and stale workers cannot restore access or complete another operation. Firebase stays disabled, with no real provider adapter or production caller.

Closes #451. Partial preparation for #421, which remains unfinished.

Depends on [PR442](https://github.com/MChartier/calibrate-health/pull/442), pinned at `4751d8d89301c18fb0fed7244c3354477e804c2b`. Review/merge order: PR431 → PR437 → PR442 → this PR; ultimate target is `master`. PR450's client work is not imported.

## Test plan and behavior evidence

This is a non-UI dormant protocol. Real PostgreSQL state and synthetic provider outcomes establish its behavior; there is no changed UI to capture. [Exact source, parent, full scope inventory and hashed execution evidence](https://github.com/MChartier/calibrate-health/blob/3d24710f48c1aac1d1caaa5f50554c00a8c44efc/README.md) are retained outside product history.

| Scenario | Expected and observed |
| --- | --- |
| Timeout, lost response, wrong identity or SQL commit failure | Account data remains until exact provider absence is confirmed; retries finish the same receipt. Passed with independently persisted synthetic provider state. |
| Process dies after intent, provider success or completion | Another process resumes without losing intent or duplicating cleanup. All three actual termination scenarios passed. |
| Issuance/reset competes with intent | Both orders preserve the security boundary for browser/native, recovery, MCP and Wear. Stale claims and an older writer's lock conflict cannot restore access. PostgreSQL race tests passed. |
| Existing data and rollback | Populated upgrade retained data through 49 migrations. Preparation rollback/re-upgrade preserved local data; accepted receipts prevent destructive rollback. |

## Supporting checks and limitations

Local backend: **811 passed, zero failures/skips**. Workspace typechecks, normal/production dead-code checks, populated upgrade and 14 rollback-helper tests passed. Existing registration/recovery/deletion and current-session password-change regressions passed. All five exact-head CI workflows passed, including fresh migrations, populated upgrade and encrypted rollback/re-upgrade. Unrelated client/device jobs retained their configured path-filter skips. The [single Codex review request received a quota-only refusal](https://github.com/MChartier/calibrate-health/pull/453#issuecomment-6070605496); independent engineering review and readiness QA remain pending under the existing quota amendment.

The production dead-code exclusion covers only the intentionally dormant coordinator; its normal test graph and prohibition on production imports remain checked. Local Docker encrypted-backup rehearsal was unavailable; the existing hosted gate passed.

No real Firebase rehearsal, live accounts, credentials, provider activation, client cleanup, public pending API, receipt purge policy, provisioning, deployment or release is included.