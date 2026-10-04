# Issue 412: removal of notification history

Genuine matched production-export captures from baseline `29fb444ae4389ca81f3437d24685ed9badc43410` and current source `f0220f0fc9a7827bdf2497492455205ad360d25e`. All data is synthetic. The evidence-only commit containing this directory binds the manifest, image records, build/export inventories and sanitized logs immutably.

The [manifest](manifest.json) records exact harness/fixture/build identities, commands, environment, matching and limits. Each image has an adjacent JSON record linking its source, served bundle digest, capture time, viewport/theme, route and SHA256. The capture harness checks the clean source and compares response bytes to the selected export.

All 20 original PNGs were visually inspected. Empty/populated/error/recovered panels lose the history footer while retaining reminder feedback/actions. The desktop cards occupy some space freed by the removed footer without style changes. Preferences is preserved, the legal history bell is removed, and the legacy route resolves to Today. Mobile captures show the same scrollable list at 390 by 844 in dark mode.

| Matched state | Before | After |
| --- | --- | --- |
| empty-1440-light | [Before](before/empty-1440-light.png) | [After](after/empty-1440-light.png) |
| empty-390-dark | [Before](before/empty-390-dark.png) | [After](after/empty-390-dark.png) |
| error-1440-light | [Before](before/error-1440-light.png) | [After](after/error-1440-light.png) |
| guard-cancelled-1440-light | [Before](before/guard-cancelled-1440-light.png) | [After](after/guard-cancelled-1440-light.png) |
| legacy-1440-light | [Before](before/legacy-1440-light.png) | [After](after/legacy-1440-light.png) |
| legal-1440-light | [Before](before/legal-1440-light.png) | [After](after/legal-1440-light.png) |
| populated-1440-light | [Before](before/populated-1440-light.png) | [After](after/populated-1440-light.png) |
| populated-390-dark | [Before](before/populated-390-dark.png) | [After](after/populated-390-dark.png) |
| preferences-1440-light | [Before](before/preferences-1440-light.png) | [After](after/preferences-1440-light.png) |
| recovered-1440-light | [Before](before/recovered-1440-light.png) | [After](after/recovered-1440-light.png) |

## Behavioral validation and limits

Client tests: 211 suites / 1,052 tests; focused 9 suites / 51 tests. Typechecks, dead-code checks, production exports and 16 web-release checks pass. UX: 250 passed / 79 configured skips. Final focused browser checks: 92 passed across all four viewport projects; separate phone route matrix: 10 passed; final phone Settings: 1 passed / 1 opt-in capture skip. Capture runs: 10 Before + 10 After passed.

The broad desktop data-state matrix is **not green**: 86 passed / 5 failed. All five Today failures reproduce on unchanged baseline. The baseline also has duplicate Add food dialogs for a previous-day food reminder; this removal does not claim to repair that behavior. Browser/SSE/permission fixtures and mocked push taps are not physical-device delivery tests. See manifest limitations and the exact sanitized logs. Hosted CI, Codex review and rendered-PR inspection are recorded after publication in the PR/task checkpoint.

Reproduce from isolated checkouts with locked setup, the production export command and the capture command/environment in the manifest. The same current harness targets both servers; the baseline product checkout is unmodified. No fixture or generated image replaces the baseline implementation.
