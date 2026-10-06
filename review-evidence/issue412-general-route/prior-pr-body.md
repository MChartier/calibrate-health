## Summary

Old, read and dismissed reminders are no longer useful actions, yet the notification archive and its drawer link encourage browsing them. Remove that history UI and its entry points so the notification panel stays focused on timely reminders. Closes #412.

Old /notifications links replace themselves with /today after the existing account gates. The five-card reminder panel, badge, actions, dismissal and Preferences remain. Backend APIs and stored records are unchanged. Reminder opens also respect unsaved edits: confirm before marking read, keep pending work modal, and preserve the draft on failure without hanging on an offline-paused refresh.

## Test plan

- **Drawer and legacy route:** opening the panel should show no history footer; old bookmarks should reach Today without bypassing gates or reopening history through Back/Forward. Matched browser checks observed these outcomes.
- **Current reminders and settings:** synthetic fixtures retained five cards and the global unread count; food/weight actions used the intended local date. Dismissal, new-arrival refresh, recovery and Preferences checks passed. [Detailed observations and checks](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004359120).
- **Edited settings and failed reads:** cancellation preserved the draft and unread state. Accepted pending opens blocked dismissal; failed reads showed an error, kept the edited value and count, and allowed retry. Offline read/refresh regressions passed.

Focused tests, typechecks, production export, UX checks and configured CI passed, with recorded scope-based skips. [Validation logs](https://github.com/MChartier/calibrate-health/blob/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/README.md) and [Codex review](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004271926) provide the supporting results.

Chrome captures compare master [acc8a30](https://github.com/MChartier/calibrate-health/commit/acc8a30d6cde7477f08f0b7ace23df4047d21354) with [c5f149a](https://github.com/MChartier/calibrate-health/commit/c5f149a516cbd8733b02fffa4ebf22630db6611d), using matched synthetic fixtures, viewport and clock. [Exact source/build/capture provenance](https://github.com/MChartier/calibrate-health/blob/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/manifest.json) includes shared PWA-notice suppression and all original images.

**Drawer:** remove the history entry while keeping the current-reminder panel.

| Before | After |
| --- | --- |
| ![Before: empty notification drawer](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-empty-desktop.png) | ![After: empty notification drawer](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-empty-desktop.png) |

**Legacy address:** replace the archive with Today.

| Before | After |
| --- | --- |
| ![Before: legacy notifications address](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-legacy-desktop.png) | ![After: legacy notifications address](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-legacy-desktop.png) |

**Failed read:** the edited 08:30 value, unread count and recovery message remain; the archive footer is gone. Both captures use the same failed request. Final asks for consent before that request; master asks only after success.

| Before | After |
| --- | --- |
| ![Before: failed reminder read with preserved Preferences draft](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-failure-desktop.png) | ![After: failed reminder read with preserved Preferences draft](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-failure-desktop.png) |

[Known limits](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004906277): QA found the same five Today-matrix failures and duplicate previous-day Add Food dialogs on both revisions. Push taps and native Back checks are mocked; physical-device push delivery remains untested.

[Full requirements](https://github.com/MChartier/calibrate-health/blob/9f79d97b6bb6a66f061c21494dc7b9a60e9369e2/review-records/issue412-before-concise-rewrite/issue412-body.md) · [Prior description](https://github.com/MChartier/calibrate-health/blob/9f79d97b6bb6a66f061c21494dc7b9a60e9369e2/review-records/issue412-before-concise-rewrite/pr427-body.md) · [Complete change inventory](https://github.com/MChartier/calibrate-health/blob/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/local-scope-inventory.json).
