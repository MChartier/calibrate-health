## Problem

People using Calibrate should get a focused hosted experience without choosing or setting up a backend. Current native sign-in and Advanced settings expose server selection, and PR439 expands that workflow. The [new human direction](https://github.com/MChartier/calibrate-health/issues/405#issuecomment-6049386828) supersedes those customer-facing hosting requirements. Internal/development builds still need a fixed backend chosen when the app is built.

## Requirements and acceptance

- Remove customer-facing backend pickers, service-switching settings, URL route inputs and self-hosting promotion. No hidden developer picker. Keep useful diagnostics, compatibility/retry behavior and authorized administration.
- Use the existing public build input, `EXPO_PUBLIC_CALIBRATE_SERVER_URL`, for native/internal targets; production browser requests stay on the serving origin. Validate explicit configuration and fail closed on invalid targets. Channel names alone must not select URLs. Do not choose a new production domain or hardcode private project/account values.
- Bind authentication, recovery and credentials to the configured origin. Preserve account/session-generation checks, logout/revocation and late-response isolation. A changed target clears active credential/consent state before new authentication, without reusing another server's tokens.
- Migrate legacy saved choices safely before authenticated requests or offline replay. Preserve origin/account-scoped health data, outbox, drafts and recovery state. Pending/failed/replaying or unknown local state blocks a target transition with clear recovery guidance; no automatic cross-server replay, reassignment or silent deletion.
- Preserve useful development/build tooling and backend authorization/data safeguards. Earlier unmerged administrator/bootstrap work remains retained for later consideration rather than being deleted or silently included in this narrower change.
- Validate fixed-target resolution, legacy and interrupted transitions, storage failures, session races and recovery destination with maintained regressions. Demonstrate representative actual-master-to-final browser changes with genuine matched captures and exact provenance. Native-device checks remain explicitly unexecuted/deferred for review readiness under the [human amendment](https://github.com/MChartier/calibrate-health/issues/405#issuecomment-6041659686).

No production data migration, backend-role removal, infrastructure cleanup, provisioning, credential changes, deployment or release is included. Unified release-pipeline work has separate ownership.

## Implementation plan

Propose a focused successor from reverified master: define the fixed-target/bootstrap migration contract, remove runtime selection and promotional copy, selectively retain PR439's relevant client isolation fixes and maintained tests, then validate the final published scope and behavior. Preserve PR439 and all original evidence; do not restructure or close it until the coordinator records the intended treatment of its deferred backend scope. Coordinate shared documentation/build configuration with the release owner; keep auth PR431/437/442 independent. The source inventory and build-time findings are recorded in the planning comment.

[Exact original requirements](https://github.com/MChartier/calibrate-health/blob/5a0e855ae28d74ce70e365006821e19588ed8499/native-deferral-result-20261007/issue438-after.md) and [original recovery plan/history](https://github.com/MChartier/calibrate-health/blob/6b265afbb92951ba55e1c22212374225049c580e/pr402-recovery/recovery-plan.md) remain retained.

## Implementing Codex task

Existing owner: verified native task ID `01a1145f-aae2-70e0-af56-3952f0eab012` (shareable URL unavailable). This continuation is planning only; focused implementation awaits the coordinator's branch contract.

## Implementing PR

Current associated PR: [PR439](https://github.com/MChartier/calibrate-health/pull/439), retained earlier scope and unready for this revised outcome. Focused successor: not created. Historical original: [PR402](https://github.com/MChartier/calibrate-health/pull/402), closed without merging; source/evidence remain retained.

