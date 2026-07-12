# Android internal release

This runbook produces signed Android artifacts from the Expo project in `mobile/`:

- `internal` produces an APK for direct installation on owned devices.
- `production` produces an AAB for Google Play internal testing and later store tracks.

The permanent Android identity is the application ID `app.calibratehealth.mobile` plus its signing certificate.
Changing either creates a different app or prevents an in-place upgrade.

## One-time release setup

The repository uses EAS-managed Android credentials. EAS stores the keystore and passwords outside Git, while
`mobile/eas.json` keeps artifact shape and version ownership reviewable.

From `mobile/`:

```powershell
npx eas-cli@16.28.0 login
npx eas-cli@16.28.0 init
npx eas-cli@16.28.0 credentials --platform android
```

`eas init` links the app to an EAS project. Review and commit only its non-secret project ID if it updates
`mobile/app.json`. Let the credentials command generate or upload the one release keystore. Download an encrypted
offline backup from EAS credentials and record its alias and passwords in a password manager. Never commit a
keystore, `credentials.json`, service-account JSON, EAS access token, or signing password.

For unattended builds, store `EXPO_TOKEN` in the CI secret store. It is an account credential and must not use the
`EXPO_PUBLIC_` prefix. Backend database, food-provider, push, and session secrets remain server-side and never belong
in an Android build.

## Environment configuration

Internal builds use the EAS `preview` environment and production AABs use `production`. With no override, release
builds default to `https://calibratehealth.app`, and users can select a self-hosted origin from the sign-in screen.

To give a private build a different initial origin, define `EXPO_PUBLIC_CALIBRATE_SERVER_URL` in the matching EAS
environment. This value is compiled into the app and is public; it may contain an `https://` origin, never a token,
password, API key, username, or URL with embedded credentials. Prefer HTTPS for every non-development server.

```powershell
# Example only: the value is public inside the APK/AAB.
npx eas-cli@16.28.0 env:create --environment preview --name EXPO_PUBLIC_CALIBRATE_SERVER_URL --value https://health.example.com
```

## Versioning

`mobile/app.json` is the source of truth:

- `expo.version` is the user-visible semantic version.
- `expo.android.versionCode` is the monotonically increasing Android build number.

`appVersionSource` is `local`, and EAS profiles do not auto-increment. Before every distributed build, increment
`versionCode`; increment `version` when the user-visible release changes. Commit both before building so an artifact
can be traced to one Git commit. Google Play and Android reject an upgrade whose version code is not greater than the
installed build.

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

Run these commands from `mobile/` with the pinned CLI version used during setup:

```powershell
# Signed APK for direct installation.
npx eas-cli@16.28.0 build --platform android --profile internal

# Signed AAB for Google Play internal testing.
npx eas-cli@16.28.0 build --platform android --profile production
```

Record the EAS build URL, Git commit, semantic version, version code, and SHA-256 digest of the downloaded artifact in
the release notes. Do not rename an artifact in a way that loses those identifiers.

Install or upgrade the internal APK with Android Debug Bridge:

```powershell
adb install -r .\calibrate-internal.apk
```

`-r` performs an in-place replacement. Do not uninstall the existing app, use `adb install --uninstall`, clear app
storage, or change the application ID/signing key when testing an upgrade.

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

## Internal release checklist

- [ ] Working tree is clean and the release commit is pushed.
- [ ] `version` is correct and `versionCode` is greater than every distributed Android build.
- [ ] Application ID is still `app.calibratehealth.mobile`.
- [ ] Public Expo config includes camera/notification permissions but does not request microphone access.
- [ ] EAS reports the expected Android signing certificate fingerprint.
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
- [ ] Record artifact digest, EAS build URL, Git commit, version, version code, device/API level, and test results.
- [ ] Keep the prior artifact and encrypted keystore backup, but distribute only the new higher-version build.
