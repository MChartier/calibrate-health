## Summary

Temporary authentication outages could return a previously signed-in user to Sign In, interrupting local tracking. Failed queued writes also left editing controls without a clear recovery path. Separately, existing-account Firebase migration lacked a safe preparation foundation.

This change preserves the same-account cached workspace and durable local edits through outages/restarts, exposes retry/discard recovery, and prepares migration tooling without activating Firebase. It follows the [offline-first instruction](https://github.com/MChartier/calibrate-health/issues/421#issuecomment-6000049703).

Useful implementation decisions:

- Keep User.id and SQL data ownership; add immutable Firebase identity mapping and credential security-version guards. Local authentication remains the self-hosting default.
- Default migration tooling to sanitized dry runs; use deterministic scoped UIDs, collision/source-drift holds and a resumable BCRYPT journal that holds ambiguous outcomes instead of blindly overwriting accounts.
- Scope queues to account/server, preserve request IDs and serialize dispatch/replay. Day/pause intent survives reload; failed writes require explicit retry or discard. Goal-pace retries verify reconnection while retaining the original request identity.

**Preparation only: issue421 remains open.** Firebase runtime login/registration, recovery/verification, cross-store deletion, external security events, session/Wear integration and real-provider rehearsal remain unfinished. No live data, imports, provisioning or cutover occurred. [Full migration requirements](https://github.com/MChartier/calibrate-health/blob/3eb583d972cc529509bd8145c8cefb504b3cd000/preparation-evidence/communication-before-20261006/issue-body.md). [PR428](https://github.com/MChartier/calibrate-health/pull/428) is a separate dependent follow-up.

## Test plan and behavior evidence

| Synthetic scenario | Expected and observed result | Evidence |
| --- | --- | --- |
| Reload cached tracking during auth outage | Today remains usable, local changes persist, reconnection is visible | Outage pair below |
| Edit food after a queued write fails | No misleading successful save; explicit retry/discard recovery is available | Food pair below |
| Offline logout, restart and reconnect | Stay signed out; retry server revocation and disclose storage failures | [Logout/storage pairs](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/README.md) |
| Resume/pause/day commands across replay and restart | Retain intent, reject stale conflicting controls, preserve deliberate historical backfill | [Current-base browser scenarios and guard evidence](https://github.com/MChartier/calibrate-health/blob/008cb58ed0f2617223635c564612015a957e6d3f/preparation-evidence/integration-75578e5a/README.md) |
| Retry a lost goal-pace response after reconnecting | Verify the same account before retry; preserve one operation and existing goal progress | [Light/dark browser recovery and verification boundaries](https://github.com/MChartier/calibrate-health/blob/008cb58ed0f2617223635c564612015a957e6d3f/preparation-evidence/integration-75578e5a/README.md) |
| Dry-run/resume migration with synthetic identities | Hold collisions, drift and ambiguous imports; preserve identity and avoid unsafe retries | [Migration evidence and maintained runbook](https://github.com/MChartier/calibrate-health/blob/7afdb6f0bcbdec9d85f18c74aec610c0eb9d76a2/preparation-evidence/fc997b45-record.md) |

### Outage: cached tracking stays available

| Before | After |
| --- | --- |
| ![Before: outage](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/outage/before.png?raw=true) | ![After: outage](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/outage/after.png?raw=true) |

Before: auth-outage reload returns to Sign In. After: cached Today remains visible with pending reconnection.

### Failed write: make recovery explicit

| Before | After |
| --- | --- |
| ![Before: food](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/food/before.png?raw=true) | ![After: food](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/food/after.png?raw=true) |

Before: Save remains available behind a failed queued write. After: the local correction is visible, but saving is guarded until explicit retry/discard resolves the failure.

These genuine captures compare earlier master `acc8a30` with preparation build `ed170e7`. The pictured scenarios remain applicable to current base `52bdc32` and head `75578e5`; see the [base-impact assessment and current validation](https://github.com/MChartier/calibrate-health/blob/008cb58ed0f2617223635c564612015a957e6d3f/preparation-evidence/integration-75578e5a/README.md). Matched synthetic account, clock, viewport and theme; unrelated PWA notices were suppressed equally. [Exact source/build/fixture identities and all capture pairs](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/README.md); [final-head behavior evidence](https://github.com/MChartier/calibrate-health/blob/008cb58ed0f2617223635c564612015a957e6d3f/preparation-evidence/integration-75578e5a/README.md).

## Supporting checks and limits

Current-base validation passed 24 desktop-browser scenarios (one phone-only case skipped), 232 mobile suites (1,243 tests), 56 affected backend tests, 69 API tests, 14 rollback checks, typechecks and schema/API validation. The final goal-pace retry boundaries, mobile typecheck and web export also passed. [All five exact-head CI workflows passed](https://github.com/MChartier/calibrate-health/blob/488bc6f97295412be7004302bc78ad7cad37d8e9/preparation-evidence/integration-75578e5a-ci/README.md). [Exact results, revisions and operational record](https://github.com/MChartier/calibrate-health/blob/008cb58ed0f2617223635c564612015a957e6d3f/preparation-evidence/integration-75578e5a/README.md).

Configured review is [blocked by quota](https://github.com/MChartier/calibrate-health/pull/423#issuecomment-6006048888); independent readiness QA is pending. Native/device and real Firebase validation are not claimed. Uncached resources require connectivity; browsers without Web Locks retain queued work but cannot safely replay it. Private GitHub page rendering remains unverified; retained evidence includes a local render of API-returned Markdown with verified image bytes.

[Preserved prior PR narrative](https://github.com/MChartier/calibrate-health/blob/3eb583d972cc529509bd8145c8cefb504b3cd000/preparation-evidence/communication-before-20261006/pr-body.md).
