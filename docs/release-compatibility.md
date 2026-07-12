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

The phone fetches `/api/v1/client-config` before saving a server or sending credentials. It refuses an unsupported API
or a release older than `min_supported_mobile_version` with an actionable update message. The server also advertises
`min_supported_wear_version` so the Wear preflight can enforce the same rule when the watch gains an independent
server-selection flow. Until then, keep the Wear minimum at or below every watch build paired with a supported phone.

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

## Version bump and fast validation

1. Update `shared/release.json` first.
2. Mirror phone values in `mobile/package.json` and `mobile/app.json`; Expo prebuild generates the ignored native files.
3. Mirror Wear values in `wear/app/build.gradle.kts`; keep the pairing module aligned with the phone release.
4. If the server version changes, update the root and backend package versions and lockfiles.
5. Run the fast checks before building:

```powershell
npm.cmd run release:check
npm.cmd run test:release
```

These checks parse configuration only. They do not invoke Gradle, Expo, Docker, or the full CI suite.

The `Cut Release Tag` workflow does not calculate or mutate versions. It validates the repository and tags the exact
stable `server.version` declared in `shared/release.json`. The workflow refuses an existing, prerelease, or
non-monotonic version. This keeps the Git tag, published container version, and compatibility metadata on one release
identity.

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

## Release gate

- [ ] `npm run release:check` and `npm run test:release` pass on the release commit.
- [ ] The worktree is clean and the metadata reports the expected Git commit.
- [ ] Every distributed Android artifact has a higher `version_code` than its predecessor.
- [ ] Phone and Wear application IDs and signing certificate fingerprints match.
- [ ] Server API support and mobile/Wear minimum versions match the intended rollout order.
- [ ] Upgrade tests preserve login, local database state, queued mutations, and watch pairing.
- [ ] Phone and Wear smoke tests cover food, weight, activity, disconnect/reconnect, and offline recovery.
- [ ] Artifact SHA-256 values match the generated metadata after transfer.
- [ ] Release notes identify any raised minimum version, migration requirement, or known rollback constraint.
