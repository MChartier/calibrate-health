# Local Google Play internal testing

This is the supported Windows path for operator-built phone and Wear releases. Both apps use
`net.darkmachines.healthtracker`, display **Calibrate**, and initially connect to
`https://calibratehealth.darkmachines.net`. WireGuard must provide access on the phone. The Wear app uses the
existing paired-phone network relay; verify it while the phone UI is backgrounded.

The current first candidate is **0.2.7**, with phone code **11** and Wear code **12**. Its native version has
already been prepared in this change. Do not run `prepare` again before its first build.
The server/web version remains **0.36.0**.

## One-time Windows setup

Install Node 22.14 or newer, JDK 17, and Android command-line tools. The repository currently requires
Android platform 36, build-tools 36.0.0, platform-tools, NDK 27.1.12297006, and CMake 3.31.6 (including Ninja 1.12.1).
The local wrapper writes the generated Android `local.properties` CMake location after Expo prebuild.
CMake 3.22.1 can repeatedly regenerate Ninja files on Windows; an older Ninja also has long-path limitations.
See [Reanimated Windows guidance](https://docs.swmansion.com/react-native-reanimated/docs/guides/building-on-windows/).
Use bundletool 1.18.3 from the official Google release; its SHA-256 is
`a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29`.

Set the installed locations for the current PowerShell session (paths are examples):

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
$env:BUNDLETOOL_JAR="$env:ANDROID_HOME\tools\bundletool-all-1.18.3.jar"
npm.cmd run setup
npm.cmd --prefix shared run build
npm.cmd run release:native:internal -- doctor
```

`doctor` checks the host tools, synchronized release metadata, and the private server's
`/api/v1/client-config` contract using an uncached HTTPS request. Enable WireGuard if that request cannot connect.
It neither reads credential files nor publishes anything. Native push is currently disabled on this server;
FCM/Expo push credential setup is not needed for the first release.

## Upload signing

Phone and Wear use one upload keystore. Keep it, its passwords, and an encrypted offline backup outside the
checkout. Enroll both form factors in the same Play App Signing identity. With Google's generated app-signing
key, the upload key signs AAB submissions; Play signs the APKs installed on devices with its separate key.
Use Play for subsequent updates rather than installing an upload-key APK over a Play-installed app.

Generate an upload key with JDK keytool if one does not already exist. Let keytool prompt for passwords:

```powershell
& "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -v -storetype PKCS12 `
  -keystore 'C:\secure\healthtracker\upload.p12' -alias healthtracker-upload `
  -keyalg RSA -keysize 4096 -validity 10000
```

Create an external `credentials.json` in [Expo's Android format](https://docs.expo.dev/app-signing/local-credentials/):

```json
{
  "android": {
    "keystore": {
      "keystorePath": "C:\\secure\\healthtracker\\upload.p12",
      "keystorePassword": "FROM_YOUR_PASSWORD_MANAGER",
      "keyAlias": "healthtracker-upload",
      "keyPassword": "FROM_YOUR_PASSWORD_MANAGER"
    }
  }
}
```

Use an absolute keystore path and restrict the directory to your Windows account. Never commit this file,
the keystore, service-account JSON, or passwords. The command rejects credentials and keystores located inside
the checkout, including symlinks resolving inside it. Do not preload `CALIBRATE_ANDROID_*` signing variables:
Expo prebuild must finish before the wrapper reads the credentials and supplies them to Gradle.

## Play Console onboarding

1. Sign into [Play Console](https://play.google.com/console/) as `play-admin@darkmachines.net` and finish any
   developer-account verification. Create **Calibrate**, default language English, type **App**, pricing **Free**.
2. Use **Test and release > Testing > Internal testing**. Create/select an email list containing only
   `mchartier@gmail.com`, and save it. Use the Console's tester links to opt in with that account.
3. In **Test and release > Advanced settings > Form factors**, enable Wear OS and its dedicated release track.
   Configure `mchartier@gmail.com` for the Wear internal test too.
4. Enroll in Play App Signing with a Google-generated app-signing key. The first phone AAB upload binds this entry
   permanently to `net.darkmachines.healthtracker`; verify the package before accepting the upload. The display
   name can change later. Upload the Wear AAB to the Wear track under that same application.
5. Complete any required app-content/Health Connect declarations using
   [the health release worksheet](play-console-health-release-checklist.md). Declare the shipped read access to
   steps, active calories, total calories, exercise, and weight. Do not claim Google's reviewers or pre-launch
   devices can access the WireGuard-only backend. Broader release requires a separately planned accessible service.
6. For command-line submissions, create a Google Cloud project/service account and enable **Google Play Android
   Developer API**. In Play Console **Users and permissions**, invite the service-account email with access only to
   this app and permissions **View app information (read-only)** and **Release apps to testing tracks**. Do not grant
   production release permission. Download its JSON key to an external protected file.

Internal testing is the intended distribution mechanism, not Managed Google Play enterprise/private-app
registration. A full public listing and public production rollout are deferred. Google may show a temporary
listing/name before review. Health Connect authorization belongs to the new package and does not carry over
from the old package automatically.

## First build and manual upload

Review and commit the prepared changes before building. The command requires a completely clean checkout and
index, including untracked source files. From the repository root:

```powershell
npm.cmd run release:check
npm.cmd run release:native:internal -- build `
  --credentials-file 'C:\secure\healthtracker\credentials.json'
```

The command pins the private origin, existing Expo project, and `internal` channel during **both** preparation
and compilation. It calls `prepare:native:release`'s implementation before admitting the signing key, builds
phone/Wear APKs and AABs, checks their identities/signatures/hashes, and inspects the final AAB configuration.
It prints exact release names (`local-p@COMMIT` and `local-w@COMMIT`) and the bundle paths:

- Phone: `mobile/android/app/build/outputs/bundle/release/app-release.aab`
- Wear: `wear/app/build/outputs/bundle/release/app-release.aab`

Upload the phone bundle to the phone internal track and the Wear bundle to the Wear internal track. Use the
printed release names exactly, verify version **0.2.7** and codes **11/12**, and complete both internal rollouts.
Then compare Play's state with the locally inspected artifacts:

```powershell
npm.cmd run release:native:internal -- status `
  --service-account-file 'C:\secure\healthtracker\play-testing-service-account.json'
```

`status` opens and discards a temporary Publisher API edit to read both tracks and bundle hashes; it never commits
or changes a release. Both tracks must contain the exact completed singleton candidate with the printed name and
bundle hash. A partial pair, a pending draft, or mismatched hash is an actionable failure, not successful publication.

Join the Console-provided test links as `mchartier@gmail.com` and install Calibrate from Play on both devices.
The new package has a new local sandbox. Sign in again and re-pair the watch; server-side account data remains
available after login. Keep any old installation until its pending data has been synchronized.

## Subsequent releases

Every changed candidate needs a new semantic version and a fresh odd/even code pair. Prepare from the latest
committed candidate, review/commit the changed mirrors, then build and submit:

```powershell
npm.cmd run release:native:internal -- prepare --bump patch
npm.cmd run release:check
# Review and commit the source/version changes before the next command.
npm.cmd run release:native:internal -- build `
  --credentials-file 'C:\secure\healthtracker\credentials.json'
npm.cmd run release:native:internal -- submit `
  --service-account-file 'C:\secure\healthtracker\play-testing-service-account.json' `
  --confirm-play-console-clean
npm.cmd run release:native:internal -- status `
  --service-account-file 'C:\secure\healthtracker\play-testing-service-account.json'
```

Use `minor` or `major` when warranted; the next patch after the first candidate is **0.2.8**, codes **13/14**.
Preparation reuses the existing atomic mirror updater and leaves server versions alone. It reserves the manifest's
native tag name but neither requires a previous signed tag nor creates a tag. Retain and review the version commit
so another worktree does not allocate from stale metadata.

Before passing `--confirm-play-console-clean`, check Publishing overview for unrelated pending changes and pause
other Console/API writers. Google commits ready Console changes along with an API edit. The command completes
only `qa` (phone) and `wear:qa` (Wear), verifies both reported upload hashes, commits the pair once, and reads it back.
It has no track override or production promotion option. Repeating an accepted identical candidate verifies its
existing hashes without uploading or committing again. If only one half exists, complete that exact pair manually
or prepare a fresh version after resolving the track state; the tool will not guess.

Keep the four artifacts, `build/native-release-provenance.json`,
`mobile/android/app/build/outputs/calibrate-ota-baseline.json`, and `build/native-local-internal.json` together with
the exact source checkout for retries/status. These files are local evidence, **not GitHub release attestations**.
Do not use `recover-internal` to adopt these uploads. Transitioning to the protected GitHub pipeline requires a fresh
higher candidate built/attested/uploaded by that workflow; it alone creates authoritative signed `native-v*` tags.

## Device acceptance

- Confirm the package, phone/Wear versions, and common Play app-signing identity.
- With WireGuard on, exercise login, food/weight logging, Health Connect permissions, Wear pairing, and sync while
  the phone app is backgrounded. The watch relies on the phone relay when it cannot directly reach the server.
- Turn WireGuard off, check recoverable connectivity errors, reconnect, and verify pending operations sync once.
- Submit the next patch and verify in-place updates on both devices through Play. Enable auto-updates if desired.
- Retain Play version screenshots and device screenshots in the release record. Record actual results rather than
  treating a passed command or source review as proof of successful device behavior.

References: [Google internal testing](https://support.google.com/googleplay/android-developer/answer/9845334),
[form-factor tracks](https://support.google.com/googleplay/android-developer/answer/13295490),
[Publisher API tracks](https://developers.google.com/android-publisher/tracks),
[Health Connect publishing](https://developer.android.com/health-and-fitness/health-connect/publish).
