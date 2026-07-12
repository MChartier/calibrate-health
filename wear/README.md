# Calibrate Wear OS

Standalone native Kotlin/Compose application for the Calibrate Wear OS companion. Keeping this project outside
`mobile/android/` prevents Expo prebuilds from rewriting watch code.

## Variants

- `debug`: debug-signed and defaults to the emulator host at `http://10.0.2.2:3000`.
- `internal`: debug-signed for owned-device installs and defaults to the hosted server.
- `release`: release signing is supplied outside the repository.

Every variant uses `app.calibratehealth.mobile`, matching the phone app. Wear Data Layer requires the installed
phone and watch artifacts to have both the same application ID and the same signing identity. Debug/internal builds
therefore pair with a debug-signed phone build, while production phone and watch artifacts must use the same release
key. The variants are alternatives and cannot be installed side by side on one device.

Debug and internal builds use the exact debug keystore generated for the phone at
`mobile/android/app/debug.keystore`, with the standard `android` / `androiddebugkey` credentials. Generate it before
configuring the Wear build:

```powershell
npm --prefix mobile run prebuild:android
```

The Wear build fails with an actionable error when that file is missing instead of silently creating a different
certificate that cannot communicate through Data Layer.

Release builds require the following values as environment variables or Gradle properties. Never put their values in
tracked files:

- `CALIBRATE_ANDROID_SIGNING_STORE_FILE`: absolute path, or path relative to the repository root
- `CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD`
- `CALIBRATE_ANDROID_SIGNING_KEY_ALIAS`
- `CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD`

All four values are required together. The generated phone release build currently falls back to debug signing; it
must be configured to consume these same four values before shipping phone and watch release artifacts. Matching the
application ID is not sufficient - Data Layer release discovery also requires matching signing certificates.

Internal and release builds can bootstrap a self-hosted origin with Gradle properties. The origin is validated and
baked into `BuildConfig`; there is no runtime settings override that can silently retarget the watch. Do not put
credentials or tokens in this value because `BuildConfig` values are readable from the artifact.

```powershell
.\gradlew.bat :app:assembleInternal `
  -PcalibrateWearServerUrl=https://health.example.com

# Allow HTTP only for an explicitly trusted development network.
.\gradlew.bat :app:assembleInternal `
  -PcalibrateWearServerUrl=http://192.168.1.10:3000 `
  -PcalibrateWearAllowCleartext=true
```

HTTPS origins are accepted for any host. HTTP requires `calibrateWearAllowCleartext=true` and a literal loopback,
private IPv4/private IPv6 address, or `.local` host. Public HTTP, credentials, paths, queries, and fragments are
rejected during Gradle configuration. When the configured origin is HTTPS, cleartext traffic remains disabled even
if the allow flag was supplied.

## Validate

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleInternal --console=plain
.\gradlew.bat :app:testWearServerOriginValidation --console=plain
```

The runtime starts in an explicit unpaired state; deterministic health values are limited to Compose previews and
tests. Phone-assisted pairing, authenticated API calls, offline reconciliation, complications, and tiles are
intentionally separate follow-up work.

`WearDataLayerContract` reserves versioned coordination paths for pairing, sync invalidation, and continue-on-phone
handoffs. Health summaries do not travel over Data Layer: the paired watch will call the selected server directly and
cache its own data with Room. No always-on listener service is registered before there is bounded message handling
and persistence behavior to attach to it.
