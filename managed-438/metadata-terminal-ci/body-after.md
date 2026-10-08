## Summary

Calibrate currently exposes native backend selection and promotes self-hosting in Advanced settings. A build configured for a different backend could also inherit globally stored credentials unless startup first establishes their origin.

This change removes runtime backend controls and URL route inputs. Native/internal builds use `EXPO_PUBLIC_CALIBRATE_SERVER_URL`; production browsers use their serving origin. Native startup retains a session only for a known matching origin. A changed target requires fresh sign-in, while pending or unreadable local state blocks the transition and preserves the original data with recovery guidance.

Closes #438. This is the focused client successor to #439; its deferred administrator/bootstrap work and original evidence remain preserved. No parent PR, backend/auth-stack changes or release-helper changes are included.

## Test plan and behavior evidence

| Scenario | Expected and observed |
| --- | --- |
| Open Advanced settings | Hosting promotion and switching controls are absent; diagnostics and software updates remain. Matched browser captures below and maintained native component tests passed. |
| Start with matching, changed or unknown legacy origins | Matching sessions retain credentials. Safe changed targets start signed out; queued changes, unknown identity, unreadable storage and interrupted writes preserve originals and block unsafe authentication/replay. Maintained migration, storage and startup-gate regressions passed. |
| Complete old requests after logout/account replacement | Old callbacks cannot obtain replacement credentials or clear the replacement session. Late native tokens are queued for revocation; stale browser cookies are revoked before replacement login. Failed revocation blocks replacement until recovery. Maintained session-race tests passed. |
| Request password reset with a legacy backend URL parameter | The request remains on the serving origin. A synthetic 503 displays retry guidance without changing destinations; both independent browser captures and recorded request URLs confirm this. |

### Before / After

**Advanced settings:** removes self-hosting promotion while preserving support diagnostics and update controls.

| Before | After |
| --- | --- |
| ![Before: Advanced settings](https://raw.githubusercontent.com/MChartier/calibrate-health/a7d2ad1648d2b743cdfda5ef66950f6feee741ad/managed-438/before-advanced.png) | ![After: Advanced settings](https://raw.githubusercontent.com/MChartier/calibrate-health/0ad646c474e5b95a4d6230419cb73528d0debcae/managed-438/review-final/after-final-advanced.png) |

**Password-reset failure:** recovery remains available on the serving origin. These are independent captures of intentionally unchanged UI.

| Before | After |
| --- | --- |
| ![Before: reset failure](https://raw.githubusercontent.com/MChartier/calibrate-health/a7d2ad1648d2b743cdfda5ef66950f6feee741ad/managed-438/before-recovery-failure.png) | ![After: reset failure](https://raw.githubusercontent.com/MChartier/calibrate-health/0ad646c474e5b95a4d6230419cb73528d0debcae/managed-438/review-final/after-final-recovery-failure.png) |

Before is actual master `4cbcbc740fbe5fa5646b4de31951c79a653176d5`; After is `8e109f51598ce12a2fd0d69503d3432713696f4c`. Current head `60eca5e0add3cf612041f8a5ad5400fbd33b7abe` changes only a test timeout; [capture applicability](https://github.com/MChartier/calibrate-health/blob/296ef4f724d2c0e8c808ea6192a06a10c7a24b73/managed-438/checkpoint-60eca5e0/evidence-applicability.json) is unchanged. Separate builds used the same synthetic fixtures, 1280x1100 light browser viewport and frozen inputs. The shared harness hides unrelated transient PWA notices; compared UI pixels are unaltered. [Final provenance](https://github.com/MChartier/calibrate-health/blob/0ad646c474e5b95a4d6230419cb73528d0debcae/managed-438/review-final/provenance.json), [fixture/hash clarification](https://github.com/MChartier/calibrate-health/blob/a7d2ad1648d2b743cdfda5ef66950f6feee741ad/managed-438/provenance-notes.json), [artifact digests](https://github.com/MChartier/calibrate-health/blob/0ad646c474e5b95a4d6230419cb73528d0debcae/managed-438/review-final/artifact-digests.json) and [complete scope](https://github.com/MChartier/calibrate-health/blob/296ef4f724d2c0e8c808ea6192a06a10c7a24b73/managed-438/checkpoint-60eca5e0/scope.json) are retained outside product history.

## Supporting checks and limitations

Passed: mobile typecheck; 235 mobile suites/1,332 tests; 69 API-client tests; 251 release-configuration tests; four maintained desktop/compact PWA checks; independent Before/After web builds and four capture pairs; Android JavaScript export.

Native-device/emulator checks are deferred and unexecuted; component tests and bundling are not device execution. The [current-head Codex review](https://github.com/MChartier/calibrate-health/pull/450#issuecomment-6066642825) found no major issues. Current-head CI is complete: 14 checks passed, 11 skipped, none failed. Android/iOS builds, web smoke/build, mobile tests, typechecks, release configuration and vulnerability scanning passed. Database upgrade/rollback checks were skipped; earlier retained records are historical and do not establish current-head execution. Independent QA remains pending. Actual GitHub page-rendering inspection is waived under the recorded human amendment; genuine captures and independent pixel inspection remain required.


