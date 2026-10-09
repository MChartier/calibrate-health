## Summary

Calibrate currently exposes native backend selection and promotes self-hosting in Advanced settings. A build configured for a different backend could also inherit globally stored credentials unless startup first establishes their origin.

This change removes runtime backend controls and URL route inputs. Native/internal builds use `EXPO_PUBLIC_CALIBRATE_SERVER_URL`; production browsers use their serving origin. Native startup retains a session only for a known matching origin. A changed target requires fresh sign-in, while pending or unreadable local state blocks the transition and preserves the original data with recovery guidance.

Closes #438. This is the focused client successor to #439; its deferred administrator/bootstrap work and original evidence remain preserved. No parent PR, backend/auth-stack changes or release-helper changes are included.

## Test plan and behavior evidence

| Scenario | Expected and observed |
| --- | --- |
| Open Advanced settings | Hosting promotion and switching controls are absent; diagnostics and software updates remain. Matched browser captures below and maintained native component tests passed. |
| Start with matching, changed or unknown legacy origins | Matching sessions retain credentials. Safe changed targets start signed out; queued changes, unknown identity, unreadable storage and interrupted writes preserve originals and block unsafe authentication/replay. Maintained migration, storage and startup-gate regressions passed. |
| Complete login/register/refresh after native provider replacement, or interrupt persistence | Maintained regressions confirm that an unmounted provider cannot overwrite replacement credentials or workspace state. Cancelled storage writes restore originals before replacement readers proceed; failed restoration blocks access until recovery. Late tokens are revoked against their captured origin. Separate valid providers remain usable. Browser stale-cookie revocation regressions also passed. |
| Request password reset with a legacy backend URL parameter | The request remains on the serving origin. A synthetic 503 displays retry guidance without changing destinations; both independent browser captures and recorded request URLs confirm this. |

### Before / After

**Advanced settings:** removes self-hosting promotion while preserving support diagnostics and update controls.

| Before | After |
| --- | --- |
| ![Before: Advanced settings](https://raw.githubusercontent.com/MChartier/calibrate-health/a7d2ad1648d2b743cdfda5ef66950f6feee741ad/managed-438/before-advanced.png) | ![After: Advanced settings](https://raw.githubusercontent.com/MChartier/calibrate-health/d108dee53ff3bfb2be8bb0110166ac6f06b09048/managed-438/r1-f417e84b/after-r1-advanced.png) |

**Password-reset failure:** recovery remains available on the serving origin. These are independent captures of intentionally unchanged UI.

| Before | After |
| --- | --- |
| ![Before: reset failure](https://raw.githubusercontent.com/MChartier/calibrate-health/a7d2ad1648d2b743cdfda5ef66950f6feee741ad/managed-438/before-recovery-failure.png) | ![After: reset failure](https://raw.githubusercontent.com/MChartier/calibrate-health/d108dee53ff3bfb2be8bb0110166ac6f06b09048/managed-438/r1-f417e84b/after-r1-recovery-failure.png) |

Before is the original master/merge-base `4cbcbc740fbe5fa5646b4de31951c79a653176d5`; After is current head `f417e84b430cc46275171462cc9d2373b8ee8f3e`. Actual target master is `9dc0739e36168aa273530fe00ae5f85fb9c8a3fe`; the PR API base remains `4cbcbc74`. The [complete incoming-target assessment](https://github.com/MChartier/calibrate-health/blob/d108dee53ff3bfb2be8bb0110166ac6f06b09048/managed-438/r1-f417e84b/target-impact.json) confirms unchanged capture inputs and no auth overlap. No merged-target build is claimed.

Separate builds used identical synthetic fixtures, a 1280x1100 light browser viewport and frozen inputs. The shared harness hides unrelated transient PWA notices; compared UI pixels are unaltered. [Current provenance](https://github.com/MChartier/calibrate-health/blob/d108dee53ff3bfb2be8bb0110166ac6f06b09048/managed-438/r1-f417e84b/provenance.json), [artifact digests](https://github.com/MChartier/calibrate-health/blob/d108dee53ff3bfb2be8bb0110166ac6f06b09048/managed-438/r1-f417e84b/artifact-digests.json) and [complete published scope](https://github.com/MChartier/calibrate-health/blob/d108dee53ff3bfb2be8bb0110166ac6f06b09048/managed-438/r1-f417e84b/scope.json) are retained outside product history. Original evidence remains preserved.

## Supporting checks and limitations

Passed at the current head: 235 mobile suites/1,342 tests and 69 API-client tests in CI; local typecheck, four maintained desktop/compact browser checks, fresh web build/captures and Android JavaScript export. CI web smoke/build, Android/iOS runtime bundles, release configuration, lint and security scanning passed. Android and iOS builds passed. All 25 CI checks are terminal: 14 passed, 11 skipped, none failed. Database upgrade/rollback and emulator jobs were skipped.

[Current-head Codex review](https://github.com/MChartier/calibrate-health/pull/450#issuecomment-6067763994) completed with no major issues. Independent QA previously requested the native remount fix (R1); that fix is published, and reassessment by the same QA owner remains pending, with current-head CI and engineering review complete.

Native-device/emulator checks are deferred and unexecuted; component tests and bundling are not device execution. Actual GitHub page-rendering inspection is waived under the recorded human amendment; genuine captures and independent pixel inspection remain required.
