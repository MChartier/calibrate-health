# Release compatibility and artifact provenance

`shared/release.json` is the canonical release manifest for the server, Android phone app, and Wear OS app. The
backend and phone connection preflight consume its API and minimum-version policy directly. Android build files must
mirror the manifest because Expo and Gradle need native values before application code runs; `npm run release:check`
fails quickly when any mirror drifts.

## Compatibility policy

Calibrate uses semantic `version_name` values for compatibility decisions and positive, monotonically increasing
Android `version_code` values for upgrades. A self-hosted server should support every API listed in
`server.api.supported`. It may raise a minimum client version only when older releases cannot operate safely or
correctly; routine feature additions should remain backward compatible.

The Android native version remains independent from the server/web version. Each JavaScript bundle separately carries
the `shared/release.json` server version whose contract it expects. Bundle and server versions must have equal major
and minor components; patch differences remain compatible. This conservative release-line boundary protects a
self-host whose deployment can lag OTA publication, even when the v1 wire changes are additive.

The phone fetches uncached `/api/v1/client-config` before saving a server or refreshing a saved session. It refuses an
unsupported API, a mismatched server release line, or a native release older than
`min_supported_mobile_version` with actionable guidance. Native phone and Wear HTTP
requests also send `X-Calibrate-Client-Platform` plus `X-Calibrate-Client-Version`. The server compares the trusted
bearer-session platform with those headers on every authenticated request and requires Wear identity during the
one-time pairing exchange. Browser cookie sessions omit these headers and are unaffected.

Expo retains its normal update lifecycle; the client does not veto an update download based on the selected server.
If an incompatible bundle starts, the runtime preflight blocks normal authenticated use before session refresh and
synchronization. Longer term, production/public channel promotion should require an explicit deployment-readiness
signal for the matching server release line. Internal publication remains available for validation, and CI does not
poll private self-hosted servers. That signal can attest readiness only for the release owner's declared server
rollout; independently managed self-hosts still rely on the runtime mismatch guard.

An incompatible native request receives HTTP 426 with `CLIENT_UPGRADE_REQUIRED`, the applicable minimum version, and
a non-retryable user message. Phone keeps its credentials and offline outbox behind an update-required screen. Wear
keeps pairing, cache, and queued mutations but stops normal refresh/action work behind a dedicated update-required
state. Foregrounding that Wear screen schedules a bounded compatibility probe; a committed compatible snapshot clears
only the upgrade marker and then resumes retained queued work. This allows either an in-place watch update or a server
rollback that lowers the client floor to recover without re-pairing or discarding local data. A platform header cannot
override the device platform retained by the authenticated server session.

Compatibility changes follow these rules:

- Additive API and database changes remain compatible with the current API version.
- A breaking wire change requires a new API version while the old version remains in `supported` during migration.
- Raising a minimum client version is a last-resort safety boundary and must be called out in release notes.
- Phone and Wear artifacts must keep application ID `app.calibratehealth.mobile` and use the same signing certificate
  for Wear Data Layer communication.
- Phone and watch versions may advance independently, but each artifact's `version_code` must exceed its previously
  distributed build.

## Channels

| Channel | Phone artifact | Wear build type | Intended use |
| --- | --- | --- | --- |
| `debug` | Local Expo/Gradle debug | `debug` | Emulator and development devices only |
| `internal` | Locally signed release APK | `internal` | Owned-device validation before store release |
| `production` | Locally signed release AAB | `release` | Store-distributed release |

The internal Wear build uses shared release signing when all `CALIBRATE_ANDROID_SIGNING_*` values are supplied and
falls back to the repository debug key for local phone-debug pairing. `npm run build:native:release` supplies the same
validated signing environment to the phone and Wear release builds. Any future EAS-built phone artifact can pair only
with a Wear artifact signed by that same certificate. Never place signing material in `shared/release.json` or
generated metadata.

## Explicit server/web releases

Ordinary feature and fix PRs must not change `server.version` or its package, diagnostic, OpenAPI, generated-client,
or lockfile mirrors. Merge the desired changes to `master`, then run **Cut release** from the GitHub Actions page and
choose the semantic component to advance:

- `patch` for compatible fixes: `X.Y.Z` to `X.Y.(Z+1)`.
- `minor` for compatible features: `X.Y.Z` to `X.(Y+1).0`.
- `major` for breaking server, API, or deployment contracts: `X.Y.Z` to `(X+1).0.0`.

The action requires the checked manifest version to equal the highest stable tag, prepares every server/web mirror on
`release/vMAJOR.MINOR.PATCH`, and validates that exact commit. It verifies the candidate parent and identity,
synchronized release configuration, and exact eight-file mirror set. It also builds and starts the production image,
then checks readiness and the served web application. Unit and integration tests, generated API and deploy contracts,
dependency checks, vulnerability scanning, and database upgrade/rollback rehearsal remain targeted pull-request or
scheduled checks and are not replayed for the version-only candidate. If `master` advances while validation runs, the
candidate is not merged; rerun the action so the later change is part of a newly validated candidate.

After validation, the action creates a version-only release PR, fetches the exact merge commit GitHub generated for
that PR, and verifies its base parent, candidate parent, and tree. It pushes that commit to `master` without force, so
GitHub atomically rejects the merge if `master` changed after the final drift check while retaining the PR audit trail.
**Publish prepared release** verifies that the exact candidate is now an ancestor of `master`, creates or verifies its
annotated tag, and calls the reusable GHCR image workflow with `publish_latest: true`. It is called directly rather
than relying on
token-generated push or PR events, whose workflow behavior is restricted by
[GitHub's `GITHUB_TOKEN` rules](https://docs.github.com/en/actions/concepts/security/github_token).
After image publication, the workflow publishes the exact release commit to Expo internal and waits for the protected
production approval. It does not wait for or trigger self-host deployment. The compatible native-build baseline is
read from `shared/release.json`.

Expo's automatic check and download lifecycle remains unchanged. Compatibility is evaluated only after a bundle is
running: native startup compares its bundled server release line with uncached client configuration before restoring
the saved session or synchronizing. An incompatible update can therefore download and start before the runtime gate
blocks normal authenticated use. Protected production approval is the current public-channel promotion control. A
future automated gate may require an explicit deployment-readiness signal for the release owner's declared server
rollout, but independent self-hosts still require the runtime guard. CI must not poll private servers.

The preparation command is also available for isolated release tooling tests:

```powershell
npm.cmd run release:prepare -- --bump patch
```

It updates `shared/release.json`, root/backend package manifests and lockfiles, the two-version web diagnostics
window, the OpenAPI enum, and its generated TypeScript union as one validated batch. Do not run it in an ordinary
feature worktree and commit the result manually.

Recovery is deliberately state-specific:

- Before merge, failed validation or `master` drift deletes only the unchanged action-owned candidate branch. Fix the
  failure on `master` and rerun **Cut release**.
- If any post-merge tag, image, or OTA stage failed, rerun **Publish prepared release** with the release commit and
  branch shown in the action summary. Tag creation is idempotent, and a manifest ahead of the latest tag blocks
  another version bump until this is resolved.
- **Build Release Image** remains available for an image-only rebuild. Moving `latest` is allowed only for the highest
  stable tag; use **Publish prepared release** when the ordered image and OTA stages must also resume.

The reusable image workflow still prevents rebuilding an older tag from executing historical deployment jobs.
Validated releases publish version, source-SHA, and moving `latest` tags to GHCR; deployment to a self-host remains an
operator-controlled Docker Compose operation. No GitHub Release object or generated changelog is created.

**Cut release** owns exact-candidate metadata validation plus the production container build and startup smoke.
Affected pull-request and scheduled workflows own the broader test, dependency, vulnerability, and migration gates.
The local `release:check:container` command covers the encrypted backup/restore smoke, dependency policy, canonical
version checks, and the static release-acceptance policy; `release:check:production` adds strict dependency policy.
Physical Android/Wear, store-console, and distributed-upgrade checks remain available when the owner considers them
useful for a native distribution, but do not block publishing an independent server/web image.

Phone and Wear releases remain independent. For a native release, update `shared/release.json`, mirror phone values in
`mobile/package.json` and `mobile/app.json`, mirror Wear values in `wear/app/build.gradle.kts`, and keep the pairing
module aligned with the phone release. Expo prebuild continues to generate ignored native files. Run the fast checks
before building:

```powershell
npm.cmd run release:check
npm.cmd run test:release
```

## Reproducible artifact metadata

Generate metadata from the exact release commit. Set `SOURCE_DATE_EPOCH` to the commit timestamp so repeated runs over
the same commit and artifacts produce the same timestamp. Write the result outside the repository so creating the
file does not itself make the recorded worktree dirty.

```powershell
$env:SOURCE_DATE_EPOCH = git show -s --format=%ct HEAD
npm.cmd run release:metadata -- --channel internal `
  --artifact phone=mobile\calibrate-internal.apk `
  --artifact wear=wear\app\build\outputs\apk\internal\app-internal.apk `
  > ..\calibrate-internal-release.json
```

The JSON records the channel, Git commit and dirty state, canonical server/client versions, application ID, artifact
file names, byte counts, and SHA-256 digests. Keep it with the artifacts and release notes; it intentionally contains
no credentials, machine-specific absolute paths, or wall-clock timestamp.

## Native distribution review

Use the applicable items below when distributing phone or Wear artifacts. This is an owner review checklist, not a
standing server/web CI or release gate.

- [ ] `npm run release:check` and `npm run test:release` pass on the release commit.
- [ ] The worktree is clean and the metadata reports the expected Git commit.
- [ ] Every distributed Android artifact has a higher `version_code` than its predecessor.
- [ ] Phone and Wear application IDs and signing certificate fingerprints match.
- [ ] Server API support and mobile/Wear minimum versions match the intended rollout order.
- [ ] Upgrade tests preserve login, local database state, queued mutations, and watch pairing.
- [ ] Phone and Wear smoke tests cover food, weight, activity, disconnect/reconnect, and offline recovery.
- [ ] Artifact SHA-256 values match the generated metadata after transfer.
- [ ] Release notes identify any raised minimum version, migration requirement, or known rollback constraint.
