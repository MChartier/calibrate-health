# Android internal release

Local phone/Wear and OTA publishing commands are documented in [the local release runbook](local-release.md).

This runbook produces locally signed Android artifacts from the Expo project in `mobile/` and the native Wear
project in `wear/`:

- Phone and Wear APKs are used for direct installation on owned devices.
- Phone and Wear AABs are used for Google Play testing and later store tracks.

The permanent Android identity is the application ID `app.calibratehealth.mobile` plus its signing certificate.
Changing either creates a different app or prevents an in-place upgrade.

This runbook defines release procedures; it is not proof that a permanent-signed artifact was built, a device was
tested, an OTA update was published, or Play accepted a bundle. Those claims exist only in the commit-specific,
repository-safe evidence described below and the access-controlled Console record.

## One-time release setup

The canonical release path uses one operator-controlled keystore for both phone and Wear. This is required for Wear
Data Layer communication because both artifacts share `app.calibratehealth.mobile`. Generate the keystore outside
the repository, retain an encrypted offline backup, and record its alias and passwords in a password manager.

Set these values in the current PowerShell session. The store path may be absolute or relative to the repository
root:

```powershell
$env:CALIBRATE_ANDROID_SIGNING_STORE_FILE='C:\secure\calibrate-release.p12'
$env:CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD='<from-password-manager>'
$env:CALIBRATE_ANDROID_SIGNING_KEY_ALIAS='calibrate'
$env:CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD='<from-password-manager>'
```

Release-device inspection also requires the official bundletool all-in-one JAR. Keep it outside the repository and
point `BUNDLETOOL_JAR` at its absolute path in the same PowerShell session:

```powershell
$env:BUNDLETOOL_JAR='C:/Tools/bundletool-all-<version>.jar'
if (-not (Test-Path -LiteralPath $env:BUNDLETOOL_JAR -PathType Leaf)) {
  throw 'BUNDLETOOL_JAR must name the downloaded official bundletool all-in-one JAR.'
}
```

The release-device command does not download or infer this tool. It fails closed when the variable is absent, the
file is missing, or either AAB manifest cannot be parsed and matched to `shared/release.json`.

Never commit a keystore, `credentials.json`, service-account JSON, access token, or signing password. Backend
database, food-provider, push, and session secrets remain server-side and never belong in an Android build.

`mobile/eas.json` retains prospective cloud-build profiles, but EAS remote credentials are not the canonical path:
the repository's Gradle contract requires the four shared signing values above for both projects. Do not call an EAS
artifact release-ready until that profile has been wired to the same keystore and its certificate has been compared
with the Wear artifact.

## Environment configuration

Official release builds default to `https://calibratehealth.app`. A previously selected self-hosted origin remains
authoritative across restarts, and custom-server selection remains available under Advanced sign-in options.

To give a private build a different initial origin, define `EXPO_PUBLIC_CALIBRATE_SERVER_URL` before building. This
value is compiled into the artifacts and is public. The release script accepts only a credential-free `https://`
origin without a path, query, or fragment.

```powershell
# Example only: the value is public inside the APK/AAB.
$env:EXPO_PUBLIC_CALIBRATE_SERVER_URL='https://health.example.com'
```

Private builds that use Expo push must also have a stable Expo project ID. EAS builds embed it automatically.
The same public identity is required for Expo OTA updates. The mobile app is linked to
`@calibrate-health/calibrate-health-app` with project ID
`fda8f8c5-e646-47ac-82fb-35003c9cbec7` in `mobile/app.json`. Verify that link after signing in:

```powershell
npm.cmd ci --prefix tools/eas-cli --include=dev --no-audit --fund=false
Push-Location mobile
..\tools\eas-cli\node_modules\.bin\eas.cmd login
..\tools\eas-cli\node_modules\.bin\eas.cmd project:info
Pop-Location
```

These commands use the exact EAS CLI dependency graph reviewed in `tools/eas-cli/package-lock.json`. Do not replace
them with `npx`, a global EAS installation, or a moving CLI version while authenticating the Expo account.

Do not initialize a replacement project. Keep the public `owner`, `slug`, and `extra.eas.projectId` values in
`mobile/app.json`, or set the same project UUID explicitly before a local Gradle build:

```powershell
$env:EXPO_PUBLIC_EAS_PROJECT_ID='<expo-project-uuid>'
```

The app passes this identity when requesting its Expo push token and re-registers after native token rotation. It
also embeds the EAS Update URL, the app-version runtime policy, and the `internal` update channel in local dogfood
builds. A missing project ID disables OTA and leaves native push in an actionable error state instead of creating an
ambiguously scoped token.

## Versioning

Server releases, native releases, and OTA update IDs advance independently. See
[client-versioning.md](client-versioning.md) for the explicit server requirement carried by each bundle.
`shared/release.json` owns native metadata and its Expo/Gradle mirrors:

- `expo.version` is the user-visible native version and exact Expo `appVersion` runtime.
- `expo.android.versionCode` uses the odd phone lane; Wear uses the even lane.
- `expo.ios.buildNumber` mirrors the phone build counter as a string. Apple distribution remains separate.

Prepare each new phone/Wear candidate from a clean checkout:

```powershell
npm.cmd run release:native:prepare -- --bump patch
```

Choose `minor` or `major` for the native release's user-visible scope. Preparation refreshes `origin/master`,
rejects stale counters, allocates the next globally unique code pair, and updates native mirrors together.
It leaves the server version and `requiresServer` unchanged. Review and merge these changes before building.
No prior signed native tag is required; native tag names retained in metadata are historical labels.

Every different store candidate, including recovery, needs a new native version and higher codes.
Promoting an existing Play artifact keeps the same codes. Run `npm.cmd run release:check` after preparation.

## Validate from a clean checkout

Run from the repository root on the exact commit intended for release:

```powershell
npm.cmd ci --ignore-scripts --no-audit --fund=false
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile test -- --runInBand
Push-Location mobile
node ..\node_modules\expo\bin\cli install --check
node ..\node_modules\expo\bin\cli config --type public
node ..\node_modules\expo\bin\cli prebuild --platform android --clean --no-install
Pop-Location
```

The last command recreates ignored `mobile/android/` output and verifies native config. It must not introduce tracked
files. Use the repository's local Android/Gradle validation after prebuild when an SDK is installed.

## Build artifacts

Configure the local environment in [local-release.md](local-release.md), then run:

```powershell
npm.cmd run release:native -- --profile internal
```

The command builds signed phone/Wear APKs and AABs locally. It runs Expo prebuild with public configuration,
then admits Android signing variables only to the prepared Gradle build. It verifies the pinned wrappers,
dependency locks, and verification metadata before building. There is no Expo cloud build.

All four canonical outputs must exist:

- `mobile/android/app/build/outputs/apk/release/app-release.apk`
- `mobile/android/app/build/outputs/bundle/release/app-release.aab`
- `wear/app/build/outputs/apk/release/app-release.apk`
- `wear/app/build/outputs/bundle/release/app-release.aab`

The local build record binds their hashes, source commit, Android signing certificate, native runtime
fingerprint, and public Expo configuration. APK and AAB metadata/signers are inspected independently with
`aapt`, bundletool, `apksigner`, and `keytool`. Phone and Wear must use the same certificate.

Keep the artifacts and `.local-release` records for OTA compatibility and retry checks. The existing
`build/native-release-provenance.json` sidecar also supports optional device diagnostics. These records
are ordinary operator-owned JSON; they need no additional receipt-signing key.

Install the saved pair with `npm.cmd run release:native:devices -- --skip-build`. The lower-level
`prepare:native:release` and `build:native:release` commands remain available for tooling diagnostics.

## Publish and install through Google Play

Build the production-channel pair and upload both AABs to Play internal tracks:

```powershell
npm.cmd run release:native -- --profile production
```

Use `--build-only` to prepare the pair without uploading. The command verifies artifact metadata,
hashes, source, and Android signing before admitting Play credentials. It detects conflicting codes
and can recover an already-completed upload of the exact pair.

Test and promote those same phone/Wear codes through closed testing and production in Play Console.
Store promotion never rebuilds. These binaries receive production OTA even on a Play internal track;
install the internal native profile for internal-channel OTA testing.

Finish Console declarations and first-upload requirements, and pause unrelated Console/Publisher changes
while uploading. The maintainer deploys any required server changes first; client commands print the
requirement but do not poll or block on server deployment.

### First Play installation and signing migration

Android accepts an in-place update only when the installed and incoming APKs use the same app-signing certificate.
During Play App Signing enrollment, either provide the existing permanent app-signing key so Play-delivered builds
retain the installed identity, or uninstall the existing local/debug build once and reinstall from Play, accepting
the loss of that app sandbox's local sessions and queued data. Back up or sync needed data first.

The locally produced APKs and AABs use the upload key. When Play uses a distinct app-signing key, an upload-key APK
cannot update a Play-installed app and a Play APK cannot update an upload-key-installed app. Use Play itself for
routine installs after migration; keep direct APKs only for explicitly separate test-device flows.

### Local publishing setup and key lifecycle

Follow [local-release.md](local-release.md) for Android upload signing, the expected certificate hash,
Play service-account access, and Expo configuration. Keep secrets local and maintain an encrypted backup
of the Android keystore. The local path needs no receipt/tag signing key, allowed-signers onboarding,
GitHub publishing environment, or native-tag GitHub App.

Retain build records and artifacts. A changed or missing artifact cannot be adopted merely because Play
has a matching release name; restore the original bytes or prepare a new higher native version.

## Optional commit-specific device diagnostic

Build from a clean, pushed source commit so the signed artifacts, canonical `shared/release.json`, and any optional
physical-device result describe the same source. If source, scripts, configuration, or documentation changes after
physical execution, treat the old result as historical.

The repository-safe result contains no hardware or ADB serials, absolute paths, account identifiers, email, health
values, food names, tokens, request payloads, reviewer credentials, or private Console URLs. It records only the
allowlisted build provenance, artifact, signer, version, Samsung handset/watch class and model/OS, upgrade-state,
fixed checkpoint command/capability IDs with boolean outcomes, and derived capability fields. Use only a synthetic
account.

Follow `docs/physical-galaxy-validation.md` when physical validation is useful. Finalized results are optional owner
diagnostics, not CI or release authorization. The hosted emulator jobs use disposable signing and prove only the
package/runtime behavior they exercise.

## One-command physical device workflow

For routine dogfood builds, use the interactive repository workflow from the release checkout:

```powershell
npm.cmd run release:native:devices
```

The command prompts only for signing values that are not already present in `CALIBRATE_ANDROID_SIGNING_*`, and hides
password input from the terminal and shell history. It then:

1. Builds both release APKs with the configured HTTPS server origin.
2. Verifies the package IDs, versions, artifact hashes, and shared signing fingerprint.
3. Discovers physical phone and Wear targets, preferring them over emulators and collapsing duplicate watch mDNS rows.
4. Offers to run `adb pair` when no watch is connected.
5. Preflights installed signatures before making changes. Matching releases upgrade in place; an incompatible debug
   signer requires typing `REPLACE` before local app data is removed.
6. Installs, launches, and checks that both processes remain alive.

Reuse already-built artifacts with `--skip-build`. Explicit flags support unattended repeat installs after the
operator has intentionally authorized any signer replacement:

```powershell
npm.cmd run release:native:devices -- `
  --skip-build `
  --phone-serial '<phone adb or hardware serial>' `
  --watch-serial '<watch adb or hardware serial>'
```

`--server-url`, `--keystore`, `--key-alias`, `--eas-project-id`, and `--updates-channel` replace the corresponding
prompts. Signing passwords are intentionally accepted only through hidden prompts or environment variables.
`--replace-incompatible` is available for an explicitly authorized debug-to-release reset; normal repeat installs
never need it. Run with `--help` for the complete option list.

Install or upgrade the internal APK with Android Debug Bridge:

```powershell
adb install -r .\calibrate-internal.apk
```

`-r` performs an in-place replacement. Do not uninstall the existing app, use `adb install --uninstall`, clear app
storage, or change the application ID/signing key when testing an upgrade.

## Expo OTA updates between native builds

From a clean checkout descending from the saved native build, run:

```powershell
npm.cmd run release:ota -- --channel internal
npm.cmd run release:ota -- --channel production
```

Run only the channel being released. Each command finds that native runtime/channel's local record,
checks source ancestry and the native fingerprint, exports Android JavaScript/assets without credentials,
then publishes through a separate minimal EAS project. Expo delivers it to installed builds on the
selected channel with exactly matching runtime/platform. There is no signed-tag target matrix.

JavaScript-only changes, including `requiresServer`, can use the existing native runtime. Wear changes,
native modules, permissions, plugins, native dependencies, and app identity/version changes need a new
native pair. Never override a runtime to force incompatible bundles onto older installations.

Deploy the required server version before publishing. The script prints the requirement; startup and
server-selection checks protect clients using independently deployed servers. There is no server-readiness
publication gate or Expo download veto. The Expo token has project-wide authority and stays local.

The `release:native:ota` alias enters the same command and accepts `--channel` and `--dry-run`.
These commands publish Android OTA only; iOS distribution remains separate.

## Preserve on-device data during upgrades

Expo SecureStore tokens and the SQLite offline outbox live in each native application's sandbox. Preserve them
through an in-place Android or iOS upgrade by keeping all of the following true:

1. The Android application ID and iOS bundle identifier remain `app.calibratehealth.mobile`.
2. The new Android artifact retains its signing certificate and the iOS artifact retains its signing identity.
3. Android `versionCode` or iOS `buildNumber` increases for that platform.
4. The app is upgraded in place instead of uninstalled or data-cleared.

Before shipping a SQLite or authentication-storage change, test an upgrade from each last distributed native build with
both an active session and pending/failed offline mutations. Export account data first when testing migrations against
important real data. Database migrations must be forward-compatible; neither platform can safely roll back to a build that
does not understand a newer on-device schema.

If a release is bad, prepare a new patch native release and publish its higher odd/even version-code pair. Keep historical artifact identities unchanged. A lower-version APK is not a safe rollback for
SecureStore or SQLite changes.

## Disposable emulator upgrade rehearsal

Rehearsal version flags specify the odd phone code; Wear receives the next even code. Defaults are baseline 1/2
and candidate 3/4. Both candidate codes must exceed the baseline pair. Historical source clones retain their
own release validation and need not contain iOS configuration.

`npm run test:native:upgrade` creates isolated local clones, overrides version codes only in those clones, signs phone
and Wear APKs with one disposable identity, and installs the candidate with `adb install -r`. It never uninstalls the
app or clears application data. Dry-run is the default and performs only Git/ADB discovery before printing the exact
plan. Baseline and candidate refs execute their Expo/Gradle build logic, so use only trusted commits from this
repository. Child builds receive an allowlisted environment that excludes unrelated service credentials and tokens:

```powershell
npm.cmd run test:native:upgrade -- `
  --baseline a99fcb8 `
  --candidate HEAD `
  --phone-serial emulator-5554 `
  --wear-serial emulator-5556 `
  --disposable-keystore mobile\android\app\debug.keystore `
  --disposable-key-alias androiddebugkey `
  --allow-existing-package
```

The ignored Expo debug keystore is acceptable only for this emulator rehearsal. Never pass the permanent Play/release
key. Existing disposable-key credentials are read only from `CALIBRATE_REHEARSAL_STORE_PASSWORD` and
`CALIBRATE_REHEARSAL_KEY_PASSWORD`; no password is written to the result. Execute mode copies the key into the owned
temporary directory, pulls each installed base APK there, and compares full certificate SHA-256 fingerprints before
the first replacement:

```powershell
$env:CALIBRATE_REHEARSAL_STORE_PASSWORD='android'
$env:CALIBRATE_REHEARSAL_KEY_PASSWORD='android'
npm.cmd run test:native:upgrade -- `
  --execute `
  --baseline a99fcb8 `
  --candidate HEAD `
  --baseline-version-code 1 `
  --candidate-version-code 3 `
  --phone-serial emulator-5554 `
  --wear-serial emulator-5556 `
  --disposable-keystore mobile\android\app\debug.keystore `
  --disposable-key-alias androiddebugkey `
  --allow-existing-package
```

Interactive execution launches the baseline and pauses for the operator to prepare login, pairing, cached data, and
offline outbox state. After upgrading, it requires separate `YES` confirmations for session/server/settings,
phone food/weight data, exactly-once phone outbox replay, Wear pairing/cache, and exactly-once Wear action replay
before recording `behavior-check-passed`. Non-interactive package-only automation must add `--package-only`; its
retained JSON is labeled as package/install evidence and proves only version increase, signer continuity, unchanged
`firstInstallTime`, live processes after launch, and clean crash-pattern checks. It records
`package-check-passed` and does not satisfy login, pairing, cache, Room migration, or outbox-preservation gates.
The script refuses physical devices, implicit ADB targets, active `CALIBRATE_ANDROID_SIGNING_*` values, a signer
mismatch, a non-increasing candidate version, or recursive cleanup outside its unique marked short build root.

## Owner-discretion distribution checklist

Use the checks below when they are relevant to an actual native distribution. The physical phone/watch protocol and
broader Play worksheet are optional confidence aids; repository automation does not require every box for pre-release
development.

- [ ] `npm.cmd run release:check`, `npm.cmd run test:release`, and `npm.cmd run test:native-release` pass.
- [ ] Run only the optional emulator, upgrade, OTA, or physical checks that are useful for this distribution.
- [ ] The source commit is clean and pushed before signing.
- [ ] `version` is correct; phone has the next odd `versionCode`, Wear has the next even code, and both exceed every
  code already allocated to either form factor.
- [ ] This native version and code pair have not been used for an earlier store candidate.
- [ ] Application ID is still `app.calibratehealth.mobile`.
- [ ] Public Expo config includes camera/notification permissions but does not request microphone access.
- [ ] OTA-enabled phone config has the expected EAS project ID, app-version runtime, and update channel.
- [ ] Phone and Wear report the same expected Android signing certificate fingerprint.
- [ ] No keystore, password, token, service-account JSON, backend secret, or credential URL is tracked or embedded.
- [ ] Mobile typecheck, tests, Expo dependency check, public config, clean prebuild, and local Gradle build pass.
- [ ] Upgrade the previous signed APK with `adb install -r`; do not uninstall it first.
- [ ] Existing login survives the upgrade and logout/login still work.
- [ ] Existing food, weight, settings, and pending/failed offline changes survive and reconcile correctly.
- [ ] Test food entry, barcode entry, weigh-in, day completion, account export, and notification permission on a device.
- [ ] With phone and watch connected, confirm a reminder appears only through normal phone/Wear bridging and no second watch-local alert is posted.
- [ ] With the phone disconnected and watch networking available, confirm the bounded watch refresh posts one combined, deep-linked food/weight reminder.
- [ ] Confirm a self-hosted HTTPS origin can be selected and survives an app restart.
- [ ] Inspect the APK/AAB for an expected public server origin and absence of credentials.
- [ ] Record C and the canonical manifest hash plus independent path/size/digest/application/version/signer facts
  for phone APK/AAB and Wear APK/AAB; record only Samsung model, OS, and API level for devices.
- [ ] Before publication, confirm the required server version is deployed and run the selected native/OTA command with `--dry-run`.
- [ ] Generate and retain the deterministic release metadata described in `docs/release-compatibility.md`.
- [ ] Keep the prior artifact and encrypted keystore backup, but distribute only the new higher-version build.
- [ ] If a physical result is retained, verify it locally against the source commit; no evidence-only child is needed.
