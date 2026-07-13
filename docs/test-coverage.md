# Test Coverage

This repo has automated tests for the backend, web frontend, and Android phone client, plus
targeted Kotlin/JVM and device checks for the Wear client:

- `npm run test` runs backend, frontend, and mobile tests.
- `npm run test:coverage` runs backend `c8` coverage and frontend Vitest V8 coverage.
- Package-specific commands include `test:backend`, `test:frontend`, `test:mobile`,
  `test:coverage:backend`, and `test:coverage:frontend`. Wear JVM tests run from the Gradle project
  with `wear/gradlew testDebugUnitTest`; a non-debuggable APK smoke runs against an adb watch target
  with `npm run test:wear:emulator`. PR builds compile and run the Wear JVM suite independently of
  the longer phone build.
- `npm run test:db:upgrade` applies migrations through `0020` to an isolated schema, inserts
  representative account/goal/weight/food data, upgrades through current, verifies retention, and
  removes only that generated schema. Its helper tests run without Postgres.
- `npm run test:web:e2e` launches the API and Vite directly, waits for Postgres-backed readiness,
  and runs the critical browser path in the machine's installed Chrome. It does not download a
  Playwright browser or add the suite to the long-running CI path.

The browser suite resets only `test@calibratehealth.app`, completes onboarding, records food and
weight, and then checks the narrow dashboard and Settings at a 390x844 touch viewport. It uses
reduced-motion mode and keyboard activation for the mobile tabs. The managed server ignores the
generic `DATABASE_URL`: its default and any `CALIBRATE_E2E_DATABASE_URL` override must target a
loopback host and an E2E-named disposable database. Reusing a caller-owned loopback server also
requires `CALIBRATE_E2E_ALLOW_DESTRUCTIVE_RESET=true`. `PLAYWRIGHT_CHROME_CHANNEL` or
`PLAYWRIGHT_CHROME_PATH` can select another locally installed Chromium build.

## Current Coverage Shape

Backend coverage is broadest today. It includes route-level tests for the main API surfaces plus utility/service tests for profile math, food provider normalization, imports, local dates, notifications, weights, and goal rules.

Frontend and mobile coverage focus on domain logic that has the highest risk of silent regressions:

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

Coverage reports remain useful for finding unexercised modules and unexpected drops. Raising or
adding a numeric package threshold should follow measured baseline cleanup rather than encouraging
low-value tests that merely execute lines.
