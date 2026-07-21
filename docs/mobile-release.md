# Android internal release

This runbook produces locally signed Android artifacts from the Expo project in `mobile/` and the native Wear
project in `wear/`:

- Phone and Wear APKs are used for direct installation on owned devices.
- Phone and Wear AABs are used for Google Play testing and later store tracks.

The permanent Android identity is the application ID `app.calibratehealth.mobile` plus its signing certificate.
Changing either creates a different app or prevents an in-place upgrade.

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

Never commit a keystore, `credentials.json`, service-account JSON, access token, or signing password. Backend
database, food-provider, push, and session secrets remain server-side and never belong in an Android build.

`mobile/eas.json` retains prospective cloud-build profiles, but EAS remote credentials are not the canonical path:
the repository's Gradle contract requires the four shared signing values above for both projects. Do not call an EAS
artifact release-ready until that profile has been wired to the same keystore and its certificate has been compared
with the Wear artifact.

## Environment configuration

With no override, release builds default to `https://calibratehealth.app`, and users can select a self-hosted origin
from the sign-in screen.

To give a private build a different initial origin, define `EXPO_PUBLIC_CALIBRATE_SERVER_URL` before building. This
value is compiled into the artifacts and is public. The release script accepts only a credential-free `https://`
origin without a path, query, or fragment.

```powershell
# Example only: the value is public inside the APK/AAB.
$env:EXPO_PUBLIC_CALIBRATE_SERVER_URL='https://health.example.com'
```

Private builds that use Expo push must also have a stable Expo project ID. EAS builds embed it automatically.
The same public identity is required for Expo OTA updates. Link the mobile project once (an Expo account is required):

```powershell
Push-Location mobile
npx.cmd --yes eas-cli@latest login
npx.cmd --yes eas-cli@latest project:init
npx.cmd --yes eas-cli@latest project:info
Pop-Location
```

Keep the public `extra.eas.projectId` added by `project:init`, or set the project UUID explicitly before a local
Gradle build:

```powershell
$env:EXPO_PUBLIC_EAS_PROJECT_ID='<expo-project-uuid>'
```

The app passes this identity when requesting its Expo push token and re-registers after native token rotation. It
also embeds the EAS Update URL, the app-version runtime policy, and the `internal` update channel in local dogfood
builds. A missing project ID disables OTA and leaves native push in an actionable error state instead of creating an
ambiguously scoped token.

## Versioning

`shared/release.json` is the cross-platform source of truth; see `docs/release-compatibility.md` for the compatibility
policy and artifact metadata format. The native phone values mirror it in `mobile/app.json`:

- `expo.version` is the user-visible semantic version.
- `expo.android.versionCode` is the monotonically increasing Android build number.

Before every distributed build, increment `versionCode`; increment `version` when the user-visible release changes.
Commit both before building so an artifact can be traced to one Git commit. Google Play and Android reject an upgrade
whose version code is not greater than the installed build.

Run `npm.cmd run release:check` after every version change. It also verifies the backend package, generated Android
project, Wear app, pairing module, application ID, and EAS profile names without invoking a native build.

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

Run this from the repository root with the signing environment above:

```powershell
npm.cmd run build:native:release
```

The command fails before native work when signing is incomplete or the configured origin is not a credential-free
HTTPS origin. It regenerates the ignored phone Android project with a clean Expo prebuild, then builds APK and AAB
artifacts for phone and Wear with the same signing identity. The release workflow supplies a larger Gradle heap and
metaspace allowance for Expo release lint, removes stale final artifacts before each build, and fails immediately if
Gradle does not recreate both outputs. Outputs are under `mobile/android/app/build/outputs/` and
`wear/app/build/outputs/`.

Record the Git commit, semantic versions, version codes, SHA-256 digests, and signing certificate fingerprint in the
release notes. Do not rename an artifact in a way that loses those identifiers.

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

Expo OTA updates apply only to the Android phone app's JavaScript, styling, and bundled assets. Wear OS, native
modules, permissions, config plugins, app identity/version, dependencies with native code, and native icons require a
new signed phone/Watch build. The currently installed pre-OTA build must be replaced once after `expo-updates` is
introduced; later compatible updates can use the faster path below.

Build and install an OTA-enabled release through the physical-device workflow. When a project ID is present, the
native build records an ignored compatibility baseline beside the generated APK outputs. That file contains no
keystore values or passwords; it records the Git commit, runtime, channel, server origin, project ID, and a hash of
the native inputs that produced the installed binary.

For a committed JavaScript/assets-only change, validate without uploading and then publish:

```powershell
npm.cmd run release:native:ota -- --dry-run --message 'Describe the tested update'
npm.cmd run release:native:ota -- --message 'Describe the tested update'
```

The command always targets Android, reuses the installed build's project, server, runtime, and channel, and invokes
the current EAS CLI from the repository. It refuses a dirty working tree, a divergent Git history, a changed native
fingerprint, a runtime mismatch, or a different channel. Before bundling, it pulls the selected EAS environment and
requires `EXPO_PUBLIC_CALIBRATE_SERVER_URL`, `EXPO_PUBLIC_EAS_PROJECT_ID`, and `EXPO_UPDATES_CHANNEL` to match the
installed-build baseline; this prevents an EAS environment from silently redirecting a self-hosted app. Run it
interactively after `eas login`; automation can use `--non-interactive` with `EXPO_TOKEN`. The default dogfood mapping
is channel `internal` with EAS environment `preview`; production builds and updates use `production` for both.

Release builds check for updates without blocking startup. After an update is downloaded, fully close and reopen the
phone app again to run it. Keep the signed native artifact: OTA is not a substitute for an installable recovery build,
and a native incompatibility must be corrected with a higher-version signed APK/AAB.

## Preserve on-device data during upgrades

Expo SecureStore tokens and the SQLite offline outbox live in the Android application sandbox. Android preserves
them when all of the following remain true:

1. The application ID remains `app.calibratehealth.mobile`.
2. The new APK/AAB is signed by the same certificate.
3. `versionCode` increases.
4. The app is upgraded in place instead of uninstalled or data-cleared.

Before shipping a SQLite or authentication-storage change, test an upgrade from the last distributed signed APK with
both an active session and pending/failed offline mutations. Export account data first when testing migrations against
important real data. Database migrations must be forward-compatible; Android cannot safely roll back to a build that
does not understand a newer on-device schema.

If a release is bad, publish a fixed build with a higher version code. A lower-version APK is not a safe rollback for
SecureStore or SQLite changes.

## Disposable emulator upgrade rehearsal

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
  --candidate-version-code 2 `
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

## Internal release checklist

Execute the paired phone/watch runtime path in `docs/physical-galaxy-validation.md`; use the broader Play worksheet
for store policy and declaration evidence.

- [ ] `npm.cmd run release:check` and `npm.cmd run test:release` pass.
- [ ] Working tree is clean and the release commit is pushed.
- [ ] `version` is correct and `versionCode` is greater than every distributed Android build.
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
- [ ] Record artifact digest, Git commit, version, version code, device/API level, and test results.
- [ ] Before an OTA publish, run `release:native:ota -- --dry-run` and confirm no native fingerprint mismatch.
- [ ] Generate and retain the deterministic release metadata described in `docs/release-compatibility.md`.
- [ ] Keep the prior artifact and encrypted keystore backup, but distribute only the new higher-version build.
