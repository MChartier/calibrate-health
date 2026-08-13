# Dead-code checks

Run `npm run test:dead-code` after installing both the root and backend dependencies. The check runs Knip in its comprehensive mode and then in production mode so code used only by tests remains visible as a separate cleanup signal.

The pull-request gate enforces unused files, dependencies, devDependencies, unlisted and unresolved imports, and configuration hints. Unused exports and exported types are warning-staged: Knip reports them for cleanup review, but they are not yet blocking errors.

The configuration treats each directory with a `package.json` as a Knip workspace, including the separately installed backend and the nested Wear pairing module. Root package scripts and the GitHub Actions plugin provide script entry points; the reset-onboarding script and two non-default Playwright configurations are listed explicitly. The generated API client surface is ignored as generated code, and the backend Prisma plugin configuration is explicit.

The small `ignoreDependencies` lists model packages that Expo or Metro loads dynamically and tooling supplied through hoisted root installations. They document real module-resolution edges rather than blanket exceptions for unused dependencies.

Review findings before removing anything. Do not use Knip's `--fix` option in this repository: file and dependency removal should remain intentional and should be followed by the relevant type-check, test, build, and `git diff --check` gates.
