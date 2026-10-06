## Summary

The notification archive presents old, read and dismissed reminders that no longer need action, while the side panel sends users to that archive through “View all notifications.” Remove that history screen and its entry points so the notification panel stays focused on timely reminders. Existing /notifications bookmarks replace themselves with /today after the normal sign-in, account and onboarding gates.

The active reminder panel keeps its five current cards, global unread badge, actions, dismissal and recovery. Preferences remains the home for notification controls. Accepted reminder opens respect unsaved edits: confirmation precedes the read request, pending work contains focus and blocks dismissal, and a failed read preserves the draft. Successful read reconciliation does not wait for an offline-paused refetch.

Closes #412. This independent replacement of #417 starts directly from actual master, including merged #410 and #416. #417 remains open/draft with its historical source, evidence and receipts retained.

## Before / After

All six pairs are genuine browser captures from separate, clean production exports: **Before acc8a30d6cde7477f08f0b7ace23df4047d21354**, **After c5f149a516cbd8733b02fffa4ebf22630db6611d**. The same synthetic fixtures, clock (2026-07-21T19:00Z), locale, timezone, viewport and capture harness were used on both. Desktop: 1440×1000/light; phone: 390×844/dark; Chrome 154.0.8037.95. No images were generated, reconstructed or edited.

**Empty reminder panel:** the archive footer disappears while the empty state and merged compact rail remain.

| Before — actual master | After — this change |
| --- | --- |
| ![Before: empty reminder panel, desktop light](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-empty-desktop.png) | ![After: empty reminder panel, desktop light](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-empty-desktop.png) |

**Populated reminder panel:** the same top viewport retains the current reminder list and 20 unread count. The old footer is below this phone viewport; the desktop pairs and maintained assertions demonstrate its removal.

| Before — actual master | After — this change |
| --- | --- |
| ![Before: current reminder list, phone dark](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-populated-phone.png) | ![After: current reminder list, phone dark](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-populated-phone.png) |

**Legacy address:** actual master renders notification history; the same /notifications address reaches Today after replacement. The After heading has the natural focus outline from the redirect.

| Before — actual master | After — this change |
| --- | --- |
| ![Before: legacy notifications address, desktop light](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-legacy-desktop.png) | ![After: legacy notifications address, desktop light](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-legacy-desktop.png) |

**Preferences:** notification controls remain unchanged. Identical pixels here are independent captures from the two source-verified exports.

| Before — actual master | After — this change |
| --- | --- |
| ![Before: notification Preferences, phone dark](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-preferences-phone.png) | ![After: notification Preferences, phone dark](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-preferences-phone.png) |

**Pending reminder open:** the edited 08:30 value remains visible. After consent, the final panel shows “Opening reminder,” contains focus and disables dismissal until the read resolves.

| Before — actual master | After — this change |
| --- | --- |
| ![Before: held reminder read with edited Preferences, desktop light](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-pending-desktop.png) | ![After: held reminder read with edited Preferences, desktop light](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-pending-desktop.png) |

**Failed reminder read:** the 503 response restores controls, retains the edited draft and 20 unread count, and shows the recovery message.

| Before — actual master | After — this change |
| --- | --- |
| ![Before: failed reminder read with preserved draft, desktop light](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/before-failure-desktop.png) | ![After: failed reminder read with preserved draft, desktop light](https://raw.githubusercontent.com/MChartier/calibrate-health/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/captures/after-failure-desktop.png) |

For the last two pairs the harness accepts confirmation when presented. Master defers confirmation until the read succeeds (zero prompts during this held/failed read); final asks first (one accepted prompt). The input, held request and 503 response are matched; this source-dependent interaction difference is recorded rather than hidden. Transient PWA notices are suppressed and service workers blocked equally in both fixtures.

## Test plan

| Expected behavior | Observed at this head | Evidence |
| --- | --- | --- |
| Remove history and direct shortcuts without breaking old links or gates | Drawer and legal shortcuts are absent; direct/reloaded legacy URLs replace with Today; Back/Forward cannot recover history; sign-in, verification, legal acceptance and onboarding gates still apply | Maintained legacy/nested route tests; legacy and empty-panel pairs |
| Preserve timely reminders and count | Five current cards and global count remain; SSE invalidation, reminder-specific local-date actions, dismissal and retry pass without history/read-all calls | Shared synthetic fixture; notification browser and query tests; populated pair |
| Protect edits and recover from failures | Cancel keeps the draft and unread state; accepted pending reads block duplicate open/Close/Escape/backdrop and preserve modal focus; failure keeps the draft and permits retry | Guard/drawer unit tests; maintained browser cancel, pending, failure and retry scenarios; pending/failure pairs |
| Recover offline without waiting forever | Read mutation starts while the online manager is offline; successful PATCH reconciles the active cache and navigates even when the following query refetch is paused | Maintained offline mutation/refetch browser regressions |
| Retain Preferences and the merged shell | Permission/blocked/error/retry controls pass; compact rail keyboard/history/resize, light/dark and enlarged-text checks pass | Preferences tests/pair; compact-rail suite |
| Preserve server compatibility and records | Product inventory contains no backend, schema, shared API contract, retention, privacy or export change | Complete one-commit inventory and merge diff; client legacy route remains |

Current-head local validation at **c5f149a516cbd8733b02fffa4ebf22630db6611d**:

- All repository TypeScript checks and the production Expo web export passed. Both Before and After export inventories bind every output file.
- Mobile: **212 suites / 1,084 tests passed**.
- Focused browser routes/reminders/editors: **144 passed / 4 opt-in capture skips**, across four viewports.
- Compact rail: **11 passed**. Phone Settings: **1 passed / 1 opt-in capture skip**.
- UX/accessibility: **250 passed / 79 existing skips**.
- Dead-code contract and Knip checks passed; Expo web release/static-route contracts: **16 passed**.
- Actual matched captures: **5 scenarios passed per source**, producing six pairs (pending and failure share a scenario). All 12 original images were inspected at full resolution.

Exact commands, sanitized logs and reproduction inputs are in the [evidence README](https://github.com/MChartier/calibrate-health/blob/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/README.md) and [manifest](https://github.com/MChartier/calibrate-health/blob/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/manifest.json). The npm 12 root wrapper rejected the forwarded runInBand option before executing tests; the repository-documented direct mobile command passed. Exact-head aggregate CI completed successfully: [Lint](https://github.com/MChartier/calibrate-health/actions/runs/37381057584), [Tests](https://github.com/MChartier/calibrate-health/actions/runs/37381057488), [Builds](https://github.com/MChartier/calibrate-health/actions/runs/37381057575), [Database Upgrade](https://github.com/MChartier/calibrate-health/actions/runs/37381057563), and [Production Container Scan](https://github.com/MChartier/calibrate-health/actions/runs/37381057626): **11 successful jobs / 14 configured scope skips**. The skips include backend/database execution, full web/PWA and six-state matrices, UX CI and native/emulator jobs; they are not claimed as passes. Local UX and affected browser coverage are reported separately above. The single authorized [Codex review request](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004221144) completed on this exact head: [result](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004271926), [completed summary](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004225537). It reported “Didn’t find any major issues”; the full paginated review and inline-comment reads contain no actionable findings. This is engineering review, not human approval.

Limits: browser API/SSE/permission fixtures are synthetic. Push-tap and native Back checks are mocks, not device delivery results; no device/emulator/release installation was performed. Independent QA reran the broader Today six-state comparison on actual master and this final revision: both produced 1 pass and 5 failures, and both showed duplicate previous-day Add Food dialogs. These are inherited current-baseline limitations, not introduced fixes or passing checks.

## Scope and evidence identity

Published product scope is **1 commit, 30 files, +973/-1129**: 12 product files (+50/-440), 17 maintained tests/fixtures (+918/-689), and five maintained compatibility-documentation lines. The [ordered commit/parent and per-file rationale inventory](https://github.com/MChartier/calibrate-health/blob/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/local-scope-inventory.json) and [complete merge diff](https://github.com/MChartier/calibrate-health/blob/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/complete-merge.diff) bind the full scope. The [complete published-scope audit](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004219698) independently reconciles all API pages, ordered parents, per-commit paths and live totals. There is no evidence add/update/delete churn in this branch. The shared fixture supports maintained regressions; the small phone Settings fixture adjustment reuses existing transient-notice suppression. No one-off capture harnesses, screenshots, logs or manifests enter product history.

- Repository/target: MChartier/calibrate-health, master at **acc8a30d6cde7477f08f0b7ace23df4047d21354**.
- Head: mchartier/remove-notification-history-clean at **c5f149a516cbd8733b02fffa4ebf22630db6611d**; merge base **acc8a30d6cde7477f08f0b7ace23df4047d21354**; direct parent commit equals that base. Declared PR parent: **none (independent)**; ultimate target: master.
- #410/#416 are already in the base. #423 was assessed at 7ff6937c9cd43fea1e239b537b6f77adfcbf1dda: no changed-path overlap; auth/outbox adjacency remains an integration consideration, not a dependency. No sibling branch was absorbed.
- Evidence commit: **dd9b611ded286189cb1d49e2f202638061d5048c**, retained at **refs/heads/evidence/issue412-master-c5f149a** outside product history. Manifest SHA256: **a02ac566c28de305d5e13af01d382277cfdfc4306d72385988d3016bcec10958**.
- The manifest binds 44 artifacts, 39 exact source-file identities, both source trees, complete build inventories, fixture/harness/config hashes, per-capture served JS/CSS bytes and every image digest. Immutable full-commit URLs were publicly fetched and digest-verified. Owner: MChartier, implementation task 01a105d0-2544-70b1-813c-cf8460fd70c6, native MCHARTIER_ZBOOK. Retain this ref and original #417 refs for all reviews/receipts; never rewrite, delete or merge evidence refs.

Draft only; current-head CI and configured engineering review are complete. Independent QA is owned by task 01a1062d-a938-744a-9a70-580866b010d6; see the revision-scoped QA verdicts in the discussion for assessed results and limitations. The coordinator separately verifies receipts and readiness, and the human retains merge/release decisions.
