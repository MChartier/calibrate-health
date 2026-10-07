## Summary

Calibrate users need a clear service choice, and self-hosted operators need account administration without maintaining raw administrator IDs in deployment settings. This adds a managed-first native chooser, separate Service & hosting settings, and an administrator directory with confirmed role changes.

New self-hosted databases grant exactly one first-account owner. Existing installations import valid legacy IDs once. Fresh authorization checks, last-admin protection and verified-account recovery preserve access; directory reads no longer block ownership changes. Account/server changes retain master's offline and session-revocation protections.

Closes #438. Draft successor to #402, which stays open pending coordinator verification. Based directly on master; #431/#437 are unchanged and still require coordinated auth integration. [Original history/evidence retention](https://github.com/MChartier/calibrate-health/blob/6b265afbb92951ba55e1c22212374225049c580e/pr402-recovery/retention-manifest.json).

## Test plan and behavior evidence

| Scenario | Expected and observed |
| --- | --- |
| Concurrent registrations, demotions/deletion, and directory scans | Eight real PostgreSQL scenarios passed: one first owner, no managed-host bootstrap, a verified admin survives competing removals, directory reads proceed during the ownership lock, and mid-scan revocation rejects results. Failed-delivery recovery and populated legacy import also passed. [CI log](https://github.com/MChartier/calibrate-health/actions/runs/37569261100/job/112623996176). |
| Admin/member access, promotion cancel/confirm, feature toggle and service navigation | Four desktop Chrome scenarios passed with synthetic data. Members cannot use admin controls; cancel sends no update; confirmation changes the displayed role. |
| Native server choice, cancellation, offline changes and late session responses | Component/session regressions passed, including credential clearing only after confirmation and late-token revocation. **Actual native chooser evidence remains missing**; no attached device or local emulator was available. |

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

**Not ready for human review:** actual native chooser evidence and independent engineering review/QA remain outstanding. Browser captures and native bundle checks do not replace device evidence. Public artifact access and all four images were checked by the implementation owner. PR-page image-rendering verification uses the general human waiver; independent pixel/provenance checks remain required.
