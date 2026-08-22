# Dead-code checks

Run `npm run test:dead-code` after installing both the root and backend dependencies. The check first runs Knip comprehensively, including tests, and then checks the production graph. Production mode excludes exported-value and exported-type findings because its test-free graph would report APIs that are intentionally consumed by tests; the comprehensive pass already enforces those categories.

The pull-request gate treats unused files, dependencies, devDependencies, unlisted and unresolved imports, configuration hints, exported values, and exported types as blocking errors.

The configuration treats each directory with a `package.json` as a Knip workspace, including the separately installed backend and the nested Wear pairing module. Root package scripts and the GitHub Actions plugin provide script entry points; the reset-onboarding script and two non-default Playwright configurations are listed explicitly. The mobile Expo config plugins and shared calibration scenarios are explicit entries because Expo and the calibration lab load them dynamically. The generated API client surface is ignored as generated code, and the backend Prisma plugin configuration is explicit.

The small `ignoreDependencies` lists model packages that Expo or Metro loads dynamically and tooling supplied through hoisted root installations. They document real module-resolution edges rather than blanket exceptions for unused dependencies.

Review findings before removing anything. Do not use Knip's `--fix` option in this repository: file and dependency removal should remain intentional and should be followed by the relevant type-check, test, build, and `git diff --check` gates.
