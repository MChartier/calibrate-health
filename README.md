# Quantity entry evidence — issue 448

Retained nonmerged evidence owned by task `01a11c77-0cff-76e7-b21f-6f5702949026`. Keep this ref and every historical commit for review and future audit; never merge it into product history. No patient/live-account/provider data is present.

## Proposed change and observed behavior

At 390x420, fixed meal/search controls used to collapse the selected-food editor's inner scroll area. The selected sheet now scrolls its controls and editor together. Amount and Add remain reachable, while the ordinary layout retains the same controls and ordering. Its sheet height now follows the scrollable content up to the existing maximum; this explains the small vertical shift in the retained normal-height comparison.

The edit dirty check formerly discarded a one-millionth change. It now compares values converted with the existing six-place serving precision. Editing 0.25 to 0.250001 sends 1.000004 servings and reopens with 0.250001 after reload, rather than silently reverting to 0.25.

Baseline: `547206a1b372b73fc95fc412ad453b8099440000` (actual master after human goal449 merge). Proposed source: `ff05e56ed338ec2c178dc05cdf77125d34395c67`, whose only parent is that baseline. One commit, three paths: two source files and one maintained browser regression file. No dependencies on PR450 or other open stacks. The earlier scoping source `8eb6014adc6ed0ea327fa09fbd2af76afef284d5` is preserved separately and is not relabeled as the current baseline.

## Evidence map

- `implementation/matched-before-results` and `matched-after-results`: final matched captures, observed request bodies/geometry, and Playwright traces. Use `capture-short-selected-food-sheet/short.png` and `capture-supported-precision-after-save-and-reload/reopened.png` as the representative pairs. `normal.png` documents ordinary-height behavior.
- `implementation/before-build.json`, `after-build.json`: every build-file identity, bound to its full source commit. Exact compiled bytes are retained under `before-dist` and `after-dist`.
- `implementation/red-confirmed.log`: all three maintained assertions fail on the unchanged baseline (field intersection ratio0; missing servings_consumed in immediate and blur variants). `green-regressions.log`: the same three pass on proposed source, including reload. An earlier exploratory red run had an incorrectly initialized mutable fixture and additional404 diagnostics; it is retained honestly, superseded by the confirmed red run.
- `implementation/controls.log` and `controls-results`:18 additional checks pass for ordinary0.125/1.3/comma1,3 input through immediate or blur-save/reload, invalid/empty values, precise step buttons, visual viewport simulation, real IndexedDB outbox/replay, and stable operation identity after synthetic lost acknowledgement. API persistence/idempotency is fixture-backed, not live database evidence.
- `implementation/unit-tests.log`:6 suites/56 existing tests pass. Existing AddFoodSheet tests emit asynchronous act warnings; no failure was hidden. `typecheck.log`: Expo client type-check passes.
- `implementation/issue-original.json`: full issue body and both original conversation comments retained before any material metadata update.
- `scoping/manifest.json`: exact original manifest, SHA256 `86d752cfe7fc524a15a61eb58189566849f872d4befd44df40a557ffb484ac76`. Every referenced artifact, source-file byte and compiled-build byte is preserved. Source/build bytes are under `scoping/source-build`, and original artifact paths remain relative to `scoping`.
- `manifest.json`: SHA256 inventory of this retained evidence tree, including scripts, logs, images, traces and both compiled builds. Git commit addressing binds the manifest itself. Product source remains in the separate product commit.

## Capture provenance and reproduction

Windows host `mchartier_zbook`; Node24.19.0; Chrome155.0.8059.39; Playwright from the locked repository dependencies. Mobile/touch emulation390x844, short-window390x420, en-US, America/Los_Angeles, reduced motion. Both sides use the same synthetic quarter-cup saved food and existing log, frozen clock2026-07-21T19:00Z, user17. All API responses are routed to synthetic fixtures. The harness suppresses unrelated transient PWA notices using the maintained fixture helper; quantity UI is never hidden or edited. Screenshots are original full-viewport PNGs with no pixel transformation. Final capture scripts wait for fonts and three animation frames; earlier unsettled captures are retained under before-results/after-results but are not the published pair.

Original working layout: source checkout `quantity-fix-448`, capture folder `quantity448-implementation-evidence`, and immutable baseline export `quantity448-base-dist` are sibling folders. To reproduce, place the retained implementation scripts in that capture folder (or adjust only the relative filesystem paths), use the exact source commits/lockfile and build each export independently. The retained `serve.mjs` selects the baseline export whenever CAPTURE_PHASE contains `before`, otherwise the proposed export. Both use loopback127.0.0.1:18448; Playwright owns lifecycle and stops the server.

Commands, run from the capture folder with the source sibling installed:

```powershell
# Each source revision: npm.cmd ci --ignore-scripts --no-audit --fund=false --prefer-offline
# Each source revision: npm.cmd --prefix mobile run build:web
$env:CAPTURE_PHASE='matched-before'
node ../quantity-fix-448/node_modules/@playwright/test/cli.js test --config playwright.config.ts
$env:CAPTURE_PHASE='matched-after'
node ../quantity-fix-448/node_modules/@playwright/test/cli.js test --config playwright.config.ts
# Maintained assertions against the selected source export:
node ../quantity-fix-448/node_modules/@playwright/test/cli.js test --config regression.config.ts --project android-phone-chrome --workers 1
# Existing control checks; excludes intentionally asserted historical failures:
$env:CONTROLS='1'; $env:CAPTURE_PHASE='controls'
node ../quantity-fix-448/node_modules/@playwright/test/cli.js test --config playwright.config.ts --grep-invert 'observed one-millionth|short browser window'
```

Maintained unit command: `npm.cmd --prefix mobile test -- --runInBand AddFoodSheet.test.tsx NumberStepperField.test.tsx KeyboardAwareScrollView.test.tsx foodLogAmount.test.ts foodLogSelection.test.ts numericInput.test.ts`. Type-check: `npm.cmd --prefix mobile run typecheck`.

The captures were inspected directly by the implementation owner. Independent pixel assessment and readiness QA remain separate; the GitHub page-rendering verification waiver applies, not a waiver of genuine capture/provenance requirements. Native keyboard/device testing remains deferred. Browser short-window and simulated viewport execution are not device execution. The originally reported ordinary-decimal native symptom was not established and is not claimed fixed.
