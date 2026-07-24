# Test Coverage

This repo has automated tests for the backend and the shared Expo web/Android client, plus
targeted Kotlin/JVM and device checks for the Wear client:

- `npm run test` runs backend, API client, and Expo client tests.
- `npm run test:coverage` runs backend `c8` coverage and Expo client Jest coverage.
- Package-specific commands include `test:backend`, `test:api-client`, `test:mobile`,
  `test:coverage:backend`, and `test:coverage:mobile`. Wear JVM tests run from the Gradle project
  with `wear/gradlew testDebugUnitTest`; a non-debuggable APK smoke runs against an adb watch target
  with `npm run test:wear:emulator`. PR builds compile and run the Wear JVM suite independently of
  the longer phone build.
- `npm run test:db:upgrade` applies migrations through `0020` to an isolated schema, inserts
  representative account/goal/weight/food data, upgrades through current, verifies retention, and
  removes only that generated schema. Its helper tests run without Postgres.
- `npm run test:db:backup-restore` creates uniquely named local Docker resources, runs the real
  encrypted production backup and guarded restore scripts, compares representative food, weight,
  and activity rows, rejects plaintext artifacts, and removes only resources owned by that run.
  `npm run test:db:backup-restore:unit` validates its safety guards without Docker.
- `npm run test:web:e2e` builds the Expo web release export, serves it from a loopback static
  server, and runs the critical browser path in the machine's installed Chrome. API routes are
  deterministically fulfilled by the suite. It does not download a Playwright browser or add the
  suite to the long-running CI path.
- `npm run test:risk-evidence` quickly validates the six risk areas, their concrete test files and
  root npm scripts, and the verifier itself. It does not rerun the referenced product suites.
- `npm run test:risk-evidence:release` applies the same contract as a release gate and fails while
  any explicitly release-blocking evidence remains outstanding.

The browser suite exercises signed-out and authenticated shells across desktop, tablet, and phone
viewports; deep-link reloads; offline/recovery UI; release-surface navigation; and an offline weight
write that survives reload and replays exactly once. `PLAYWRIGHT_CHROME_CHANNEL` or
`PLAYWRIGHT_CHROME_PATH` can select another locally installed Chromium build.

## Current Coverage Shape

Backend coverage is broadest today. It includes route-level tests for the main API surfaces plus utility/service tests for profile math, food provider normalization, imports, local dates, notifications, weights, and goal rules.

Expo client coverage focuses on domain logic that has the highest risk of silent regressions:

- timezone-aware local-day helpers;
- goal progress and projection math;
- onboarding unit conversions and goal-mode inference;
- web onboarding, food logging, goals, Settings, profile photo, notification, and PWA interactions;
- serving snapshot label formatting;
- locale-based unit defaults;
- offline operation replay and account isolation;
- Health Connect normalization, checkpoints, permissions, and account cleanup;
- Wear pairing, handoff, invalidation, and deleted-account cleanup.

## Risk-based quality gates

Global line coverage is diagnostic, not the release target. Generated clients, native bridges, and
platform callbacks can move a single percentage without changing the risk of losing or exposing a
user's data. Reviews and releases use the following evidence targets instead:

[`quality/risk-evidence.json`](../quality/risk-evidence.json) is the machine-readable evidence map
for these targets. The verifier requires all six areas and their capabilities, checks that every
referenced evidence file is non-empty, validates exact root npm commands and workflow references, and
rejects expired or weakened waivers. It intentionally does not infer quality from a global line
percentage.

| Risk area | Required automated evidence |
| --- | --- |
| Authentication, session rotation, pairing, account deletion, and authorization | Success, invalid/expired credential, replay/idempotency, revocation, and cross-account denial tests at the service or route boundary |
| Offline writes, synchronization, Health Connect checkpoints, and watch reconciliation | Durable retry, duplicate replay, stale revision/conflict, account/server isolation, and reconnect tests with deterministic operation IDs |
| Database schema and data portability | Fresh migration, supported upgrade path, representative export, cascade deletion, encrypted backup validation, and clean restore evidence |
| Food, weight, goals, and activity calculations | Unit, timezone/local-day, boundary-value, immutable snapshot, and API serialization tests |
| Privacy-sensitive configuration and diagnostics | Permission/config assertions plus tests that logs, metrics, exports, and errors omit credentials and unnecessary health detail |
| Web, Android, and Wear critical workflows | Component/unit coverage for state transitions and at least one end-to-end happy path plus failure/offline path on the supported runtime |

Every change to authentication, synchronization, persisted data models, permissions, imports,
uploads, exports/deletion, or diagnostic output must add or update tests in its own pull request. A
missing platform test may be time-bounded only when the PR records the exact manual evidence, owner,
and follow-up release gate; high or critical failures are not waived by a healthy global percentage.

Physical Galaxy phone and Galaxy Watch Ultra validation is currently represented by a
release-blocking waiver owned by `MChartier`, tracked in issues `#219` and `#222`, and expiring on
2026-08-12. The normal verifier reports that blocker without breaking fast development checks; the
release variant fails until the physical happy-path and offline/reconnect evidence replaces it.
Replacement requires a retained JSON result tied to the tested release commit, execution date,
owner, phone/watch models, exact command or manual protocol, and covered physical capabilities;
ordinary unit-test paths cannot clear the device gate. Release mode also compares that tested commit
with `GITHUB_SHA` or the current Git `HEAD`, preventing stale device results from clearing a newer
candidate.
The focused execution path and retained-result shape are documented in
[`physical-galaxy-validation.md`](physical-galaxy-validation.md).
The existing Wear emulator command proves launch, package/permission state, unpaired guidance, Tile
registration, and crash absence; it is deliberately not recorded as a paired tracking happy path.

Coverage reports remain useful for finding unexercised modules and unexpected drops. Raising or
adding a numeric package threshold should follow measured baseline cleanup rather than encouraging
low-value tests that merely execute lines.
