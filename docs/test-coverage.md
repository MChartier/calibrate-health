# Testing and coverage

Start with `npm run setup`. Choose checks for the surfaces changed; `npm run ci:local` runs the
repository's local CI workflow. Commands and CI triggers are defined in [package.json](../package.json)
and [the workflows](../.github/workflows/), not by historical test counts.

## Choose a check

| Change | Command or guide |
| --- | --- |
| TypeScript | `npm run lint` checks backend, shared domain, API client, and Expo types |
| Backend, API client, or shared Expo behavior | `npm test`, or the focused `test:backend`, `test:api-client`, and `test:mobile` scripts |
| OpenAPI contract | `npm run api:contract:check` regenerates the client and rejects drift |
| Unused code or dependencies | `npm run test:dead-code`; see [safe removal guidance](dead-code.md) |
| Web export and PWA | `npm run test:expo-web:release` |
| Browser workflows | `npm run test:web:e2e` |
| Accessibility or visual behavior | [UX regression gates](ux-regression-gates.md) and [manual screen-reader checks](accessibility/launch-20-screen-reader-checklist.md) |
| Android offline/restart behavior | [Android E2E setup](android-e2e.md) |
| Wear logic | `./wear/gradlew -p wear testDebugUnitTest` from the root (`gradlew.bat` on Windows); see [Wear setup](../wear/README.md) |
| Wear package/runtime smoke | `npm run test:wear:emulator` against an explicit disposable adb watch target |
| Weight-trend model | [Model validation and tuning](weight-trend-model.md#validation-and-tuning) |
| Plan check | [Calibration QA](calibration-insight-qa.md) |
| Database changes | The isolated checks below |

The browser wrapper builds and serves the release export on loopback, uses deterministic API
fixtures, and runs installed Chrome. It does not download a browser. Set
`PLAYWRIGHT_CHROME_CHANNEL` or `PLAYWRIGHT_CHROME_PATH` to select another installed Chromium build.
Coverage includes route reloads, offline/recovery states, and a queued weight write that survives
reload and replays once. Browser mocks do not establish real backend or native-device behavior.

The manually dispatched native lanes in [Builds](../.github/workflows/builds.yml) add Android E2E,
Wear release smoke/instrumentation, and an optional same-signer package-upgrade rehearsal. PRs run
affected build and JVM checks; the expensive emulator lanes are opt-in.

## Database checks

- `npm run test:db:upgrade`: migrate a generated schema containing representative account,
  goal, weight, and food data, then verify retention through the current migration chain
- `npm run test:db:backup-restore`: exercise production age-encrypted backup and guarded restore
  with owned local Docker resources; compare food, weight, and activity data and reject plaintext artifacts
- `npm run test:db:rollback`: back up the pinned predecessor, upgrade, restore into a new empty
  target, and re-upgrade; see the [rollback protocol](database-rollback-rehearsal.md)

These checks isolate and clean up their generated resources; do not substitute a live database.
Their `:unit` variants validate helper safety without Postgres or Docker. Pinned migration boundaries
live in the scripts so this guide does not create a second, stale migration ledger.

## Coverage and risk evidence

`npm run test:coverage` runs backend c8 and Expo Jest coverage. Use `test:coverage:backend` or
`test:coverage:mobile` for one package. Coverage is diagnostic: investigate untested modules and
unexpected drops rather than adding low-value tests to raise a global percentage.

[quality/risk-evidence.json](../quality/risk-evidence.json) maps six risk areas to exact tests and
commands: authentication/authorization, offline synchronization, data portability, tracking math,
privacy/diagnostics, and critical client workflows. Update focused tests and this map when those
contracts change. Include failure, retry, stale/conflict, and cross-account cases where applicable.

`npm run test:risk-evidence` checks the map's shape, capabilities, nonempty evidence files, commands,
and workflow references. It does not execute the referenced product suites or grant release approval.

Physical Galaxy phone/watch coverage is tracked separately in the map. The optional
[physical validation protocol](physical-galaxy-validation.md) can record sanitized, commit-specific
results. An emulator package smoke proves launch, permissions, unpaired guidance, Tile registration,
and crash absence; it is not evidence of a paired physical tracking workflow.
