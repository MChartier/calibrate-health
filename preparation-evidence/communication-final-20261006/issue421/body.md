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

Synthetic browser testing observed cached tracking surviving authentication outages/reload and failed writes requiring explicit recovery. The current preparation head passed 19 browser scenarios, 231 mobile suites (1,230 tests), focused checks and all five CI workflows. Native/device and real Firebase validation remain unexecuted; configured engineering review is blocked by quota and readiness QA is pending. [Detailed results and limitations](https://github.com/MChartier/calibrate-health/blob/f0ab0b0964cf0a1b09d2f74e93ddcf4814cbd06d/preparation-evidence/final-handoff-7b83b325/README.md).

### Authentication outage: keep cached tracking available

| Before | After |
| --- | --- |
| ![Before: outage](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/outage/before.png?raw=true) | ![After: outage](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/outage/after.png?raw=true) |

Before: reloading during an authentication outage returns to Sign In. After: the same cached Today screen remains available with pending reconnection.

These genuine browser captures compare target master `acc8a30` with preparation build `ed170e7`. They remain applicable to current head `7b83b32`; later pause/day guards do not change these scenarios. Matched synthetic account, clock, viewport and theme; unrelated PWA notices were suppressed equally. [Exact source/build/fixture identities and all capture pairs](https://github.com/MChartier/calibrate-health/blob/3990f461abdc28d9d3091cb001f65f72c9264368/preparation-evidence/boundary-fixes-ed170e7e/README.md); [final-head behavior evidence](https://github.com/MChartier/calibrate-health/blob/2b993b5670d60b3f5b1e239d19980bfe6ddd4ba6/preparation-evidence/final-7b83b325/README.md).
