# Test Coverage

This repo has automated coverage tooling for both packages:

- `npm run test` runs backend and frontend tests.
- `npm run test:coverage` runs backend `c8` coverage and frontend Vitest V8 coverage.
- Package-specific commands are available as `test:backend`, `test:frontend`, `test:coverage:backend`, and `test:coverage:frontend`.

## Current Coverage Shape

Backend coverage is broadest today. It includes route-level tests for the main API surfaces plus utility/service tests for profile math, food provider normalization, imports, local dates, notifications, weights, and goal rules.

Frontend coverage now focuses on domain logic that has the highest risk of silent regressions:

- timezone-aware local-day helpers;
- goal progress and projection math;
- onboarding unit conversions and goal-mode inference;
- serving snapshot label formatting;
- locale-based unit defaults.

## Known Gaps

The largest remaining gap is frontend component and interaction coverage. The codebase has many stateful React flows (logging food, onboarding, goals, settings, profile photo upload, PWA install prompts, notification drawers) that are not yet covered by automated tests. The next meaningful step is to add React Testing Library coverage around those workflows, starting with form validation and mutation/error states, rather than chasing line coverage in static layout components.
