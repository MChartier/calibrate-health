# Archived PR stack review - September 12, 2026

This is a historical evidence index, not the current branch order, dependency audit, or release status.
The [full review at its original commit](https://github.com/MChartier/calibrate-health/blob/9292c560841ddf37dd2ebb0b38d1ec3dcae2204f/docs/pr-stack-review-2026-09-12.md)
retains the test counts, dependency findings, review corrections, and validation limits recorded then.
Use each PR's current head and checks for present status.

| Order | PR | Change | Focused validation and screenshot evidence |
| --- | --- | --- | --- |
| 1 | [#364](https://github.com/MChartier/calibrate-health/pull/364) | Current OTA compatibility guidance and shared patched dependency baseline | Release policy/contracts; [compatibility examples](screenshots/stack-review/364-compatibility-guidance.png) |
| 2 | [#349](https://github.com/MChartier/calibrate-health/pull/349) | Quick and Search food entry, including offline cached recipes | 11 focused client tests; desktop/phone saved-food lifecycle; [desktop](screenshots/launch-06/add-food-desktop-1024x1000.png), [large text](screenshots/launch-06/add-food-phone-320x568-200-percent-text.png) |
| 3 | [#375](https://github.com/MChartier/calibrate-health/pull/375) | Verified Play releases and recoverable server/Expo publication | Release/native contracts; [local release plan](screenshots/stack-review/375-release-plan.png) |
| 4 | [#376](https://github.com/MChartier/calibrate-health/pull/376) | Opted-in self-host deployment from verified images | 26 deployment tests and 29 workflow tests; [deployment test evidence](screenshots/stack-review/376-deployment-tests.png) |
| 5 | [#367](https://github.com/MChartier/calibrate-health/pull/367) | iOS and tablet support | 122 focused client tests, 47 backend tests, typechecks, two tablet browser checks; [portrait](screenshots/stack-review/367-tablet-820x1180.png), [landscape](screenshots/stack-review/367-tablet-1180x820.png) |
| 6 | [#369](https://github.com/MChartier/calibrate-health/pull/369) | Activity date navigation stays visible | 11 client tests and four browser checks; [desktop scrolled](screenshots/stack-review/369-activity-scrolled-desktop-chrome.png), [phone scrolled](screenshots/stack-review/369-activity-scrolled-compact-phone-chrome.png) |
| 7 | [#370](https://github.com/MChartier/calibrate-health/pull/370) | Nested Settings pages and guarded navigation | 48 client tests and 23 browser checks; [Settings](pr-screenshots/nested-content-settings-desktop-1024x1000.png), [profile editor](pr-screenshots/nested-content-profile-desktop-1024x1000.png), [phone preferences](pr-screenshots/nested-content-preferences-phone-390x844.png), [device confirmation](pr-screenshots/nested-content-devices-contextual-sheet-desktop-1024x1000.png) |
| 8 | [#354](https://github.com/MChartier/calibrate-health/pull/354) | Focused Plan Check with confidence and reviewed adjustments | 51 backend tests, 19 client tests, 10 lab tests, all 23 scenario screenshots refreshed and visually inspected; [on track](screenshots/plan-check/05-on-track.png), [adjustment](screenshots/plan-check/09-target-too-high.png), [compact review](screenshots/plan-check/22-adjustment-review-compact.png) |
| 9 | [#378](https://github.com/MChartier/calibrate-health/pull/378) | Nutrition-label scanning with review before save | 24 parser/OCR/route tests, real local OCR, six desktop/phone browser checks; [desktop review](screenshots/nutrition-label-scanning/review-desktop.png), [phone review](screenshots/nutrition-label-scanning/review-phone.png) |

The recorded review did not perform physical-device validation, store uploads, or a self-host deployment.
Current procedures live in [testing](test-coverage.md), [native store releases](native-store-release.md),
and [self-hosted deployment](../deploy/self-hosted/README.md). Old green checks and screenshots do not
validate a newer source commit.
