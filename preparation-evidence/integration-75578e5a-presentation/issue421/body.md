## Problem and intended outcome

Existing accounts depend on local credentials across login, recovery, sessions and deletion. Moving to Firebase must preserve passwords where supported, existing User.id, owned data and access controls, while keeping independent self-hosting available. **This migration is unfinished.**

The [human offline-first instruction](https://github.com/MChartier/calibrate-health/issues/421#issuecomment-6000049703) remains binding: temporary outages must allow local tracking, retain pending changes through restart, and show pending reconnection. Unreachable authentication is not confirmed revocation; server access and replay still require valid authorization and account/server isolation.

## Implemented preparation

Draft [PR423](https://github.com/MChartier/calibrate-health/pull/423) adds dry-run-default BCRYPT migration tooling, immutable identity mapping, provider/security foundations and durable offline tracking/recovery. Local authentication remains the default; Firebase is not activated. Existing IDs and health-record ownership remain unchanged.

## Still required

- Firebase runtime registration/login, recovery, verification, deletion and external credential-event enforcement, including browser/native/Wear sessions and lifecycle failure recovery.
- Separately authorized real-provider import/sign-in rehearsal, complete account reconciliation, rollback validation and eventual operational cutover. Synthetic tests do not establish migration readiness.
- Relevant Firebase foundations before [GCP preparation422](https://github.com/MChartier/calibrate-health/issues/422); the pause/calendar follow-up is separate in [PR428](https://github.com/MChartier/calibrate-health/pull/428).

[Full original requirements and acceptance criteria](https://github.com/MChartier/calibrate-health/blob/3eb583d972cc529509bd8145c8cefb504b3cd000/preparation-evidence/communication-before-20261006/issue-body.md) remain in force. No real-user reads/imports, provisioning, credential changes, deployment or release are authorized by this issue.

## Evidence and validation

Synthetic browser testing observed cached tracking surviving authentication outages/reload and failed writes requiring explicit recovery. Current-base validation passed 24 desktop-browser scenarios, 232 mobile suites (1,243 tests), affected backend/API/schema checks and 12 focused pace-recovery tests. [All five exact-head CI workflows passed](https://github.com/MChartier/calibrate-health/blob/488bc6f97295412be7004302bc78ad7cad37d8e9/preparation-evidence/integration-75578e5a-ci/README.md). Native/device and real Firebase validation remain unexecuted; configured engineering review is blocked by quota and readiness QA is pending. [Detailed results and limitations](https://github.com/MChartier/calibrate-health/blob/008cb58ed0f2617223635c564612015a957e6d3f/preparation-evidence/integration-75578e5a/README.md).

### Authentication outage: keep cached tracking available

| Before | After |
| --- | --- |
| ![Before: outage](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/outage/before.png?raw=true) | ![After: outage](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/outage/after.png?raw=true) |

Before: reloading during an authentication outage returns to Sign In. After: the same cached Today screen remains available with pending reconnection.

These genuine captures compare earlier master `acc8a30` with preparation build `ed170e7`. The pictured scenarios remain applicable to current base `52bdc32` and head `75578e5`; see the [base-impact assessment and current validation](https://github.com/MChartier/calibrate-health/blob/008cb58ed0f2617223635c564612015a957e6d3f/preparation-evidence/integration-75578e5a/README.md). Matched synthetic account, clock, viewport and theme; unrelated PWA notices were suppressed equally. [Exact source/build/fixture identities and all capture pairs](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/README.md); [final-head behavior evidence](https://github.com/MChartier/calibrate-health/blob/008cb58ed0f2617223635c564612015a957e6d3f/preparation-evidence/integration-75578e5a/README.md).
