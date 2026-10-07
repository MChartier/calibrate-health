## Summary
- Replace three manual server publication forms with one **Release server** action: patch/minor/major, prepared-release recovery, or image-only recovery. Remove four duplicate request/handler workflows while preserving exact request validation and operation-specific permissions.
- Add `native:release` to build, verify, and submit phone/Wear packages to Play internal tracks. `--skip-build` reuses tested artifacts or retries an upload and replaces `native:submit`.
- Add `docs/deployment.md` as the common starting point, simplify linked guides, and correct stale release/rehearsal instructions.

## Safety and compatibility
- Publication remains manual. Image-only recovery does not trigger OTA or deployment.
- Existing signing/credential boundaries, production approvals, immutable-image verification, and historical receipt identities are unchanged.
- Server/native versions and application/admin behavior are unchanged.

## Validation
- Release tooling: 148 tests passed
- Native tooling: 253 passed; one Windows-only archive test skipped on Linux
- Deployment tooling: 26 tests passed
- Backend, shared, API-client, and mobile typechecks passed
- `npm run release:check`, workflow YAML parsing, documentation link checks, and diff hygiene passed
- Actual request-building shell verified six valid input combinations and rejected eight invalid combinations
- Independent review found no correctness or security issues

No live GitHub dispatch, native package build, Play upload, OTA publication, or server deployment was performed. Full application/browser/container smoke was not rerun for this tooling/documentation change; the cloud host lacks the Docker daemon prerequisites and browser socket support for those smoke flows.

Published through the GitHub connector because this checkout has no Git/CLI credentials. The implementation commit `001fcaa` tree was verified identical to the reviewed local commit: `760aa7c2cff42e06c6bb55b0987c0bc1eac3d7fe`.

## Screenshot evidence

Genuine, unedited cloud-browser screenshots of GitHub's rendered `docs/deployment.md` at implementation commit `001fcaad8cdc639809db3133571f2b95cb4e5e20`. These document the release instructions and recovery choices; no release workflow, Play upload, OTA publication, or server deployment was run to capture them.

### Release chooser
![GitHub-rendered release chooser](https://raw.githubusercontent.com/MChartier/calibrate-health/0f53ed8239633c34d03b7f41afccfee2b8cd7b13/docs/pr-screenshots/deployment-cleanup/release-chooser.jpg)

### Recovery choices
![GitHub-rendered recovery choices](https://raw.githubusercontent.com/MChartier/calibrate-health/0f53ed8239633c34d03b7f41afccfee2b8cd7b13/docs/pr-screenshots/deployment-cleanup/recovery-options.jpg)

### One-command native release
![GitHub-rendered one-command native release guide](https://raw.githubusercontent.com/MChartier/calibrate-health/0f53ed8239633c34d03b7f41afccfee2b8cd7b13/docs/pr-screenshots/deployment-cleanup/native-release.jpg)

Capture provenance and originals: [evidence README](https://github.com/MChartier/calibrate-health/blob/0f53ed8239633c34d03b7f41afccfee2b8cd7b13/docs/pr-screenshots/deployment-cleanup/README.md). This follow-up commit adds evidence only.
