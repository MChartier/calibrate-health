# Date-only calendar correction evidence

The human requested removing the added checks and initials from completed circles in [PR feedback](https://github.com/MChartier/calibrate-health/pull/410#issuecomment-5982280191). The current circle contains its date only; plain color swatches and full legend text explain the outcomes. Factual accessible names remain intact, as do the existing pause icon, incomplete outline, selection border and date interactions.

## Exact sources and evidence identity

- Before: 230c31f120d27811228ed566f7dbb0ff6106288a, the exact human-reviewed PR version with checks and initials.
- After: 4f4dd88ddb965d65c7e0f2341f10172a3ba3bf56, the current product change.
- PR base: 29fb444ae4389ca81f3437d24685ed9badc43410; this PR remains independent of master, with no parent.
- The containing evidence commit is a descendant of After and changes evidence only. The PR body records its final head; captures are not relabeled as that later head.
- [manifest.json](manifest.json) binds original PNG hashes, individual capture records, source/build bundle hashes, fixture and common capture harness. This README and manifest are linked by immutable commit in the PR.
- [behavior-captures.json](behavior-captures.json) binds 13 additional current behavior screenshots. Their exact fixture, scenarios and project settings are committed at After.
- Previous assessed evidence remains unchanged in [the original immutable record](https://github.com/MChartier/calibrate-health/tree/230c31f120d27811228ed566f7dbb0ff6106288a/docs/pr-screenshots/issue-408). Its After images contain the superseded initials and are historical, not current UI evidence.

## Matched setup and observations

Both sources run real production Expo web builds on Windows in Chrome 154.0.8037.95, not an emulator or physical device. Desktop light is 1440 x 1000; phone-sized dark is 390 x 844. Both show Today > Choose a day, July 2026, with July 9 selected after selecting it and reopening the picker. Locale en-US, timezone America/Los_Angeles, device scale 1 and reduced motion match. Browser time is frozen at 2026-07-21T19:00:00.000Z. Actual UTC capture times are recorded separately.

Both use the exact [fixture.json](fixture.json) response bytes and the common [capture.spec.ts](capture.spec.ts). Both use the shared hideTransientPwaNotices helper to suppress unrelated transient PWA notices. Fonts settle before capture, then two identical browser screenshot buffers separated by 200ms establish a stable frame. Original screenshots are retained without pixel editing, cropping or resizing. No personal data or simulated baseline is used. Browser geometry is recorded too. An apparent overlap in the image preview was investigated: original PNG pixel runs and DOM geometry agree on separate 34px circles. The final pair uses the same stabilized harness on both sources.

The four matched originals show the checks and T/M/B/? letters removed, dates centered in unchanged green/yellow/orange/neutral circles, and plain swatches replacing legend initials. Selected July 9 remains yellow inside its outer selection border. July 17 is neutral completed/comparison unavailable; July 18 incomplete outline, July 19 not-started and July 20 pause remain intact. The pair isolates the human-requested simplification; earlier master-to-bands evidence is preserved separately.

## Reproduce

Use separate isolated worktrees at Before and After with repository-owned host setup. Copy capture.spec.ts into each checkout as e2e/expo-web/issue-408-comparison-capture.spec.ts. In each PowerShell session set CALIBRATE_COMPARISON_STAGE to before or after, CALIBRATE_COMPARISON_SOURCE to its exact full SHA, CALIBRATE_COMPARISON_FIXTURE to the same fixture.json, CALIBRATE_COMPARISON_OUTPUT to the retained evidence directory, and CALIBRATE_EXPO_WEB_PORT to distinct loopback ports (41784 Before, 41785 After). Leave CALIBRATE_EXPO_WEB_BASE_URL unset so the runner rebuilds each source.

Run in each worktree:

    npm.cmd run test:web:e2e -- e2e/expo-web/issue-408-comparison-capture.spec.ts --project=desktop-chrome --project=android-phone-chrome --workers=2

The runner invokes the Expo production build lifecycle, serves that export and executes Playwright. Two scenarios passed per source. Exported index.html and all six web bundle hashes are recorded in the manifest. Remove only the temporary copied harness after comparing its bytes with this archived copy.

For the behavior captures set CALIBRATE_CALENDAR_EVIDENCE_DIR to the output directory and run:

    npm.cmd run test:web:e2e -- e2e/expo-web/completed-calendar.spec.ts --workers=2

This passed 10 scenarios; six project-specific skips intentionally avoid repeating the desktop editor/retry and compact enlarged-text scenarios on other projects. Preserve the five editor/error/enlarged-text PNGs from the runner output before another Playwright run clears it. Eight standard theme/viewport images write directly to the evidence directory.

## Behavior validation at After

| Scenario | Expected and observed |
| --- | --- |
| Loss days July 1-7, C=0/1999/2000/2001/2499/2500/2501, T=2000, M=2500 | Green 1-3, yellow 4-6, orange 7. Exact date-only badge text, color and factual accessible labels passed. |
| Gain days July 8-13, C=2499/2500/2501/2999/3000/3001, T=3000, M=2500; equality days 14-16, C=2499/2500/2501, T=M=2500 | Orange 8, yellow 9-11, green 12-15, orange 16. No yellow interval at equality; all accessible descriptions correct. |
| Unknown history and other states, select/reopen July 9, Escape | Neutral completed day 17 contains only 17, other states and disabled future dates retained. Selected accessible name and focus return passed. |
| Reopen today's completion, edit actual food form from 2000 to 2501, save/recomplete | Calendar changes complete > open > completed orange; editor and recompleted screenshots show real UI against synthetic API persistence. |
| Fail uncached June request, Retry, return to July | Error replaces unresolved days, Retry recovers, July color retained. Component suite also verifies cached refresh failure and offline stale labels. |
| Light/dark at 320/390/820/1440px and 200% text at 320px | Eight images inspected; legend and dates reachable by scrolling, no horizontal overflow. Axe changed-flow checks passed. Enlarged screenshots show different scroll positions rather than the entire sheet at once. |

Windows-host checks actually run for this correction: npm.cmd --prefix mobile run typecheck; npm.cmd --prefix mobile test -- --runInBand (212 suites / 1070 tests passed); the production browser commands above; git diff --check. Existing React act warnings appeared in unrelated notification/activity tests; tests passed. No backend/API/domain logic changed in this correction. Exact final-head CI and configured review are linked in the PR; those results are not inferred from earlier heads.

Native/emulator/device observation and local live-Postgres application round trips remain unexecuted. Prior Docker Desktop startup was blocked; synthetic API persistence is explicitly used here. Historical backend/export contract tests and CI database upgrade/rollback evidence remain applicable to unchanged code and are linked in the PR. Independent readiness QA belongs to the coordinator's separate existing QA task.
