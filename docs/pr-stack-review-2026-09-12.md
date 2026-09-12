# Serial PR review - September 12, 2026

The nine existing PRs form one chain from `master`, in the order below. Each PR targets the previous PR's branch. Existing ready/draft states are preserved. This review does not merge or release the stack.

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

## Versions and dependencies

Every PR carries server/root/backend version `0.35.0`, with synchronized package and lockfile mirrors. This follows the current repository policy: feature PRs do not increment the server release; **Cut release** owns that after landing. The older one-offs no longer carry stale server versions.

Native versions remain independent. Version name `0.2.6` is preserved. Phone and Wear codes increase from `8/8` to `9/10` at #375 and never decrease. #367 introduces iOS build number `9`, matching the phone release code. Each adjacent pair was checked for ancestry and dependency-version decreases at matching lockfile paths; none remain.

The bottom PR establishes patched versions for XML/YAML and browser build tooling, and backend upload, email, archive, URI, query-string, and Prisma transitive dependencies. Overlapping later updates retain the newer versions. Fresh installed-graph and lockfile audits report no backend vulnerabilities and no high/critical client vulnerabilities.

One moderate upstream advisory remains in the client: [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr), through `expo-router -> query-string -> decode-uri-component`. npm reports three affected dependency entries for this single issue. The patched decoder is ESM; the current router imports the CommonJS query-string API. The upstream query-string release also changes that export shape. A forced override or npm's suggested Expo Router downgrade would require a separate compatibility fix and was not applied. Malformed percent-encoded route input remains an unresolved client denial-of-service risk.

The separately locked EAS CLI tool passes `audit:eas-cli:high`, with no high/critical findings. Its dependency graph still reports 14 moderate and one low affected entries. These are development/release tooling findings, separate from the client and backend audit counts; npm's proposed complete fix changes the pinned EAS CLI major version and was not forced into this stack.

## Review corrections

- Reconciled #364 with the compatibility behavior already on current master. The guidance keeps the native Expo update lifecycle, same-major/directional-minor startup checks, and uncached compatibility requests.
- Fixed #349's open review finding: unified offline Search now includes cached paginated Saved foods, including recipes, while preferring newer complete-list data so deleted items are not resurrected. Selecting a recipe still requires amount confirmation before logging.
- Updated the Saved foods browser test to use the remaining Search mode and a deterministic provider response.
- Preserved iOS permissions, microphone restrictions, tablet layout, native version codes, and the Add Food mode simplification when combining previously independent changes.
- Fixed notification-test cache cleanup. Client assertions had passed but five-minute query/mutation timers prevented the Windows Jest process from exiting. The complete suite now exits successfully.
- Fixed #378's open review finding: response disconnection aborts OCR, terminates the worker, and releases the process-wide slot. Tests cover abort-before-start, abort-during-work, real HTTP disconnect after upload, and a subsequent scan.
- Reconciled native configuration tests with the combined photo/camera permissions. Made label-review screenshots reproducible through the browser test and hid transient PWA notices before barcode recovery actions.
- Updated the accessibility matrix and calibration API fixture in #354 to open the new Plan Check adjustment review. The old fixture omitted the assessment and targeted a removed dialog, preventing the rest of the overlay gate from running.

The release/deployment review covered source and workflow identity, protected signing/publishing boundaries, artifact/digest verification, resumable paired Play edits, native version checks, pinned SSH identity, bounded deployment inputs, monotonic deployed state, backup freshness, and readiness verification. Deployment and store publication were not invoked.

The product review covered offline caches, immutable food snapshots, serving quantities, platform-specific identity and permissions, responsive dialogs, Activity date navigation, browser history and dirty drafts, calibration confidence and safety limits, recommendation revalidation, upload bounds, cancellation, and OCR parsing ambiguity.

## Combined validation

- Backend: **698 tests passed**, including real OCR and the cancellation regression; rerun after dependency changes.
- API client: **67 tests passed**; generated OpenAPI contract matches the checked-in client.
- Client: **200 suites / 939 tests passed**, with a clean process exit after the cleanup correction.
- Release contracts: **150 passed, one platform-specific skip**. Native release contracts: **196 passed**.
- Typechecks across backend, shared, API client, and Expo passed. Backend compilation and Expo web production build passed.
- Android and iOS runtime bundles exported successfully using the CI environment and workspace module path.
- Full desktop/phone browser gate: **122 passed, one passed on retry, 23 skipped**. Skips are the gate's declared project/opt-in cases. The retry involved calendar keyboard focus cycling; it remains a recorded intermittent failure, not an unqualified first-pass result.
- Complete phone/desktop accessibility gate: **138 passed**, including the Plan Check adjustment review, remaining overlays, and probes that verify the gate detects violations.
- The separate, non-CI Core Web Vitals diagnostic failed to obtain a nonzero INP sample, including an isolated rerun. No performance-budget overrun was measured, but that diagnostic is not validated.
- All linked screenshots were opened and visually inspected. Infrastructure screenshots show actual local plans/test output and explicitly identify simulated operations. Product screenshots use deterministic test accounts/scenarios.

## Remaining release evidence

Hosted CI is tracked on each PR, and its description records the latest check state reviewed during this task. Checks must match the updated PR head; earlier green checks do not validate rewritten heads. GitHub managed stack #379 contains all nine PRs in the order above.

Physical iPhone/iPad, Android camera/photo permissions, Wear behavior, signed store uploads, and an actual self-host deployment were not exercised by this local review. Runtime exports, browser tablet layouts, and mocked deployment tests do not establish those outcomes. Keep the existing protected publishing/production approvals and native evidence requirements.
