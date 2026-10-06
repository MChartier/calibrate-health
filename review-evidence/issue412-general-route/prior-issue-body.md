## Problem

Past, resolved and dismissed reminders are no longer actionable, but the notification history page and “View all notifications” link still invite users to browse them. Keep notifications focused on timely prompts to log food or weight.

## Change

Remove the history screen, drawer footer, legal-page shortcut and unused history-only client code. Old /notifications links replace themselves with /today through the normal account gates. Preserve current reminders, their five-card limit and unread badge, actions, dismissal, recovery and Preferences controls. Backend APIs, stored records, retention, privacy and export behavior remain unchanged.

Implementation: #427. [Original request, full acceptance requirements and history](https://github.com/MChartier/calibrate-health/blob/9f79d97b6bb6a66f061c21494dc7b9a60e9369e2/review-records/issue412-before-concise-rewrite/issue412-body.md).

## Test plan and evidence

- **Open the drawer or an old bookmark:** expect no archive entry and a safe redirect to Today. Browser checks observed both, with account gates and Back/Forward behavior preserved.
- **Use current reminders and Preferences:** expect correct counts, local-date actions, dismissal and settings. Focused checks passed, including new arrivals and failure/retry paths.
- **Leave edited settings through a reminder:** cancel should preserve the draft; failed reads should show an error and permit retry. Both were observed, including pending and offline guards.

Chrome captures compare master [acc8a30](https://github.com/MChartier/calibrate-health/commit/acc8a30d6cde7477f08f0b7ace23df4047d21354) with [c5f149a](https://github.com/MChartier/calibrate-health/commit/c5f149a516cbd8733b02fffa4ebf22630db6611d), using matched synthetic fixtures, viewport and clock. [Exact source/build/capture provenance](https://github.com/MChartier/calibrate-health/blob/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/manifest.json) includes shared PWA-notice suppression and all original images.

**Drawer:** the obsolete history entry disappears.

| Before | After |
| --- | --- |
| ![Before: empty notification drawer](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-empty-desktop.png) | ![After: empty notification drawer](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-empty-desktop.png) |

**Old bookmark:** the same /notifications address now opens Today.

| Before | After |
| --- | --- |
| ![Before: legacy notifications address](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-legacy-desktop.png) | ![After: legacy notifications address](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-legacy-desktop.png) |

[Known limits](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004906277): QA found the same five Today-matrix failures and duplicate previous-day Add Food dialogs on both revisions. Push taps and native Back checks are mocked; physical-device push delivery remains untested.
