## Summary

Calibrate users need a clear service choice, and self-hosted operators need account administration without maintaining raw administrator IDs in deployment settings. This adds a managed-first native chooser, separate Service & hosting settings, and an administrator directory with confirmed role changes.

New self-hosted databases grant exactly one first-account owner. Existing installations import valid legacy IDs once. Fresh authorization checks, last-admin protection and verified-account recovery preserve access; directory reads no longer block ownership changes. Account/server changes retain master's offline and session-revocation protections.

Closes #438. Successor to #402, based directly on master. Related auth integration: #431/#437. [Original history/evidence retention](https://github.com/MChartier/calibrate-health/blob/6b265afbb92951ba55e1c22212374225049c580e/pr402-recovery/retention-manifest.json).

## Test plan and behavior evidence

| Scenario | Expected and observed |
| --- | --- |
| Concurrent registrations, demotions/deletion, and directory scans | Eight real PostgreSQL scenarios passed: one first owner, no managed-host bootstrap, a verified admin survives competing removals, directory reads proceed during the ownership lock, and mid-scan revocation rejects results. Failed-delivery recovery and populated legacy import also passed. [CI log](https://github.com/MChartier/calibrate-health/actions/runs/37569261100/job/112623996176). |
| Admin/member access, promotion cancel/confirm, feature toggle and service navigation | Four desktop Chrome scenarios passed with synthetic data. Members cannot use admin controls; cancel sends no update; confirmation changes the displayed role. |
| Native server choice, cancellation, offline changes and late session responses | Component/session regressions passed, including credential clearing only after confirmation and late-token revocation. Native-device checks remain unexecuted and are deferred for review readiness, as detailed below. |

### Before / After

Actual master baseline: 4cbcbc74. Captured final/head: ce854348. Both use identical synthetic accounts, origin, clock, theme and scale; unrelated transient PWA notices are suppressed identically. Originals are unedited. [Exact source/build/fixture/harness identities and image hashes](https://github.com/MChartier/calibrate-health/blob/8457ed1a3bbb0f0381b48e22a40aac52b223ae6c/pr439-evidence/provenance.json).

Settings now identifies the active service and gives hosting and administration clear navigation entries (matched 1280×1500 browser viewport).

| Before | After |
| --- | --- |
| ![Before: settings](https://raw.githubusercontent.com/MChartier/calibrate-health/8457ed1a3bbb0f0381b48e22a40aac52b223ae6c/pr439-evidence/before-settings.png) | ![After: settings](https://raw.githubusercontent.com/MChartier/calibrate-health/8457ed1a3bbb0f0381b48e22a40aac52b223ae6c/pr439-evidence/after-settings.png) |

Administration grows from a feature switch to server details and a bounded directory with verified status and role actions (matched 1280×2500 viewport, chosen to show all controls).

| Before | After |
| --- | --- |
| ![Before: administration](https://raw.githubusercontent.com/MChartier/calibrate-health/8457ed1a3bbb0f0381b48e22a40aac52b223ae6c/pr439-evidence/before-administration.png) | ![After: administration](https://raw.githubusercontent.com/MChartier/calibrate-health/8457ed1a3bbb0f0381b48e22a40aac52b223ae6c/pr439-evidence/after-administration.png) |

## Supporting checks and limitations

CI passed: 786 backend tests (zero skipped), 1,319 mobile tests, 75 API-client tests, type checks, web/native bundles, critical web smoke, fresh/populated migrations and encrypted rollback. Local browser scenarios and source-bound export checks passed. [Complete published scope](https://github.com/MChartier/calibrate-health/blob/8457ed1a3bbb0f0381b48e22a40aac52b223ae6c/pr439-evidence/published-scope.json): one focused commit, 63 files; no capture archive or temporary capture machinery in product history.

Current-head [Codex review](https://github.com/MChartier/calibrate-health/pull/439#issuecomment-6031728424) reported no major issues. [Independent assessment at the same revision](https://github.com/MChartier/calibrate-health/blob/bf82d9f38c8a488720ee0e97b1b2f59c97d464a6/pr439-qa/issue-rebind-20261007/verdict.json) found no new blocking source defect and verified the browser pairs.

**Deferred native-device checks (unexecuted):** managed/self-hosted selection; cancellation or failure retaining the current destination; confirmed service changes clearing credentials and consent; and preventing switches while offline changes are unresolved or unknown. No attached device or local emulator was available. The [human instruction](https://github.com/MChartier/calibrate-health/issues/405#issuecomment-6041659686) defers these checks for review readiness. Browser captures, component tests and native bundle checks do not establish device execution.

GitHub PR-page image rendering was not checked under the [general human waiver](https://github.com/MChartier/calibrate-health/issues/405#issuecomment-6022754087).
