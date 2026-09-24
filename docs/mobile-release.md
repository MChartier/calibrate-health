# Local native builds and releases

Run local release commands from the repository root. `native:*` handles Android packages;
`ota:publish` publishes compatible phone JavaScript/assets through Expo.
Phone and Wear packages are built together. Build once, then choose how to distribute the outputs:

| Scenario | Command | Result |
| --- | --- | --- |
| Build for manual upload or installation | `npm.cmd run native:build` | Signed phone + Wear APKs and AABs |
| Release an Expo OTA update | `npm.cmd run ota:publish -- --message "Describe the update"` | Phone JavaScript/assets published to the baseline's Expo channel |
| Install the last build to local devices | `npm.cmd run native:install` | Existing APKs installed and verified on a phone and watch |
| Submit the last build through Play API | `npm.cmd run native:submit` | Existing AABs uploaded to phone/Wear internal tracks |

`native:install` and `native:submit` verify and reuse the last build; neither rebuilds it.
Use `npm.cmd run` to list scripts and `npm.cmd run <script> -- --help` for options.
There is no separate local prebuild or signing stage to run.
The only supporting root commands are `native:configure` for EAS signing credentials and Play access, and
`native:setup` for tools/dependencies (`--check` checks them without making changes).

The local profile is fixed: application ID `net.darkmachines.healthtracker`, server
`https://calibratehealth.darkmachines.net`, Expo project `@calibrate-health/calibrate-health-app`
(`fda8f8c5-e646-47ac-82fb-35003c9cbec7`), channel `internal`, and Play tracks `qa` / `wear:qa`.
Devices need WireGuard access to the backend. Public production builds and promotions use the
separate [protected GitHub store workflow](native-store-release.md).

## Shortest native release sequence

Assign your Google Play service-account key in EAS, then download signing and Play credentials once on this machine:

```powershell
npm.cmd run native:configure
npm.cmd run native:setup
```

After Play Console/API onboarding, a clean committed candidate with unused version codes can be
built and submitted with just:

```powershell
npm.cmd run native:build
npm.cmd run native:submit
```

Submission proceeds without a confirmation flag or prompt. Coordinate other Console/API writers:
Play commits can include unrelated pending changes for the same application. The command prints
a reminder, but does not claim it can detect all concurrent Console changes.
Keep the same clean source commit and all build outputs between build and submit.

`native:build` includes credential-free prebuild, signing, phone/Wear APK and AAB compilation, and
artifact/provenance verification. `native:submit` re-verifies those outputs, uploads both AABs,
commits the internal-track release, and reads it back. No manual preparation, signing, verification,
or status command is needed between them. `native:install` is optional local device testing;
`ota:publish` is a separate release of JavaScript/assets and is not part of native submission.

For a new release whose existing version codes have already been uploaded, first
[update the native version metadata](#native-version-metadata) and commit it with the intended source
changes. Then use the two commands above. `native:build` never allocates or commits a version automatically.

Setup installs tools and dependencies; it does not create signing keys, Expo/Play accounts, or API
credentials. The first Play release follows the [Console onboarding and manual-upload procedure](android-internal-testing.md).
Build verification covers package integrity and configuration; it does not run the full application
test suites or establish device behavior. Run the relevant application checks before releasing.

## Configure EAS credentials once

`native:configure` downloads both credentials and exits automatically. There are no credential menus,
download selections, or manual exit steps. It installs/reuses the locked EAS CLI and runs
`eas credentials:configure-build --platform android --profile internal` for first-time setup and
authentication. Sign in to Expo if prompted, or supply `EXPO_TOKEN`. If the app has no signing key,
EAS prompts to create one; later runs reuse the existing default key without input.
The wrapper then downloads the default keystore directly for `net.darkmachines.healthtracker` in
`@calibrate-health/calibrate-health-app`. It requires network access but can run before Android SDK setup.

For API submission, first create the Google service-account JSON key and grant its Play Console permissions
following [Play onboarding](android-internal-testing.md#play-console-onboarding). In the EAS dashboard,
open this project's **Credentials > Android > net.darkmachines.healthtracker** and assign the key under
**Google Service Account Key for Play Store Submissions**. The FCM/push key is a separate assignment.
Configure retrieves this assigned Play key together with the default signing key using your Expo login.
The automatic download uses EAS's internal GraphQL credential API through the locked CLI's authentication.
It writes the Expo-format signing JSON and keystore locally without opening the interactive credential manager.
Keep this adapter verified when upgrading EAS CLI.
EAS stores the key; `native:submit` still uses our local Play API publisher, without EAS Submit.

The wrapper downloads into a fresh directory under `%LOCALAPPDATA%\calibrate-health\eas-android-*`,
validates the result, normalizes the keystore path, and saves only absolute file paths in
`%LOCALAPPDATA%\calibrate-health\native.json`. Passwords and the private key stay in the external
download. Settings are shared by this user across checkouts/worktrees. Other hosts use
`$XDG_CONFIG_HOME/calibrate-health` or `~/.config/calibrate-health`.
EAS runs in a minimal external credentials workspace for the same project/package, so generated files
and downloads cannot enter the checkout. Its no-version-control warning applies only to that workspace;
native builds still require a clean committed checkout.

Run `npm.cmd run native:configure` again to refresh both local credentials after rotation or on a new machine.
If EAS has no assigned Play key, configure succeeds for build/install and clears any previously saved Play
path; assign the key and rerun configure before submission. It never chooses an unrelated account or FCM key.
`--service-account-file <play-json>` remains an optional local override for this configuration, skipping the
EAS Play download. A later configure without that flag returns to the current EAS assignment.
Both downloaded and explicit Play files are validated locally; configure does not upload a Play key,
authenticate to Google, or verify Play permissions. It does not generate a Google service-account key.
Cancelled/invalid downloads leave the previous configuration and credential snapshot intact. Successful
refreshes retain prior snapshots; protect this directory like any other signing-key backup.

For a single run, `native:build -- --credentials-file <file>` and
`native:submit -- --service-account-file <file>` override the saved paths without changing them.
Setup, installation, and OTA publication do not load these configured credential files.

## Set up once

On Windows x64, with Node 22.14.0+ and Git installed:

```powershell
npm.cmd run native:setup
```

Setup checks that Git runs from `PATH` before installing tools; install Git separately if it is missing.
Setup installs missing, checksum-pinned JDK 17, Android command-line tools, bundletool, and the SDK
platform/build-tools, platform-tools, NDK, and CMake required by the repository. It installs host
dependencies, builds shared code, and installs the locked EAS CLI for OTA. It reuses current installs
and reports dependency cache hits/misses. Android SDK license acceptance is interactive; add
`--accept-licenses` to accept the licenses for the packages being installed.

`npm.cmd run native:setup -- --check` reports missing local prerequisites without downloads or changes.
`native:setup -- --skip-deps` only handles the Android toolchain.

Setup saves `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SDK_ROOT`, and `BUNDLETOOL_JAR` to your Windows user
environment. Native commands read these saved paths automatically; an explicit current-shell value
takes precedence. Open a new terminal before using the tools directly. Automatic tool installation
currently supports Windows x64.

Run `native:configure` to obtain the EAS-managed signing key following
[upload signing and Play onboarding](android-internal-testing.md). Keep downloaded credentials outside
the checkout, with protected backups.

## Build packages

Review and commit source changes first. A build requires a clean checkout and records its exact source
commit. From that checkout:

```powershell
npm.cmd run native:build
```

This command prepares the native project without signing credentials, then loads the external key for
Gradle, builds phone and Wear, and independently verifies all four artifacts. Inherited
`CALIBRATE_ANDROID_*` signing variables are ignored by this local entry point; the EAS-downloaded file
(or explicit override) is the credential source. You do not need to clear or export signing variables
between stages. Build does not open the configured Play credential.

| Output | File relative to the repository root |
| --- | --- |
| Phone APK for direct installation | `mobile/android/app/build/outputs/apk/release/app-release.apk` |
| Phone AAB for Play | `mobile/android/app/build/outputs/bundle/release/app-release.aab` |
| Wear APK for direct installation | `wear/app/build/outputs/apk/release/app-release.apk` |
| Wear AAB for Play | `wear/app/build/outputs/bundle/release/app-release.aab` |

For manual Play submission, upload the two AABs to their corresponding internal tracks in Console.
Use the exact release names printed by the build: `local-p@<full-source-commit>` for phone and
`local-w@<full-source-commit>` for Wear. Confirm each track contains the matching single version code
in a completed release.
No API credential is needed to build or manually upload. Complete the
[first-upload Console onboarding](android-internal-testing.md#play-console-onboarding) first.

The build also retains `build/native-release-provenance.json`, `build/native-local-internal.json`, and
`mobile/android/app/build/outputs/calibrate-ota-baseline.json`. Keep the artifacts and these records
together. Install/submit reject changed artifacts, source, versions, signing identity, or build
configuration. Build from the new committed source again if any of those changes.

## Native version metadata

Building does not change version numbers. Before a new Play upload or a native update requiring higher
codes, use the existing maintainer helper to allocate a new pair:

```powershell
node scripts/native-internal-release.mjs prepare --bump patch
npm.cmd run release:check
```

Review and commit the resulting metadata with the intended source changes, then run `native:build`.
This helper advances the local manifest without querying Play; keep it current with previously uploaded releases.
Use `minor` or `major` when appropriate. Phone uses odd version codes and Wear uses even codes;
each new uploaded pair must exceed the previously used codes. Reusing a built artifact for installation
or submission does not require another bump. Compatible OTA-only changes do not need a native bump.

This local version operation leaves the server/web version alone and can allocate a pair without a
published native tag. It does not create authoritative `native-v*` tags or make local uploads eligible
for protected production promotion. That workflow requires a fresh higher pair and its own evidence.

## Install to a phone and watch

Enable USB or wireless debugging, connect both devices through ADB, then:

```powershell
npm.cmd run native:install
```

The command discovers targets and prompts when needed. For explicit devices:

```powershell
npm.cmd run native:install -- --phone-serial <phone-serial> --watch-serial <watch-serial>
```

It verifies the retained build before device access, checks installed versions and certificates,
installs using `adb install -r`, launches both apps, and verifies installed versions. Both devices
are required by this paired workflow. Add `--no-launch` to leave them closed.

Keeping the same application ID and signing key preserves the installation and its local data.
Downgrades are rejected. A different signing certificate requires an explicit interactive replacement
confirmation; `--replace-incompatible` authorizes uninstalling that incompatible app and erasing its
local data. Play App Signing may use a different distribution key from your upload key, so a
Play-installed app may not accept a locally signed APK in place. Use Play-distributed updates for
those installations. See [signing migration](native-store-release.md#first-play-installation-and-signing-migration).

## Submit through Play API

After Console onboarding and a successful build:

```powershell
npm.cmd run native:submit
```

The command uses the configured service-account file with access to this Play app. Submission
implicitly supplies the internal worker's Console-coordination acknowledgement. No flag or prompt is
required. Check Publishing overview and coordinate other Console/API writers before submitting:
Play commits can include pending changes for the same application.

Submission uploads only the verified phone/Wear AABs to `qa` and `wear:qa`, then reads back their
versions and hashes as part of the same command. No separate status step is required.
Submission does not promote to closed testing or production. Enroll testers through the Console
opt-in links and install/update both form factors through Play.

## Publish OTA through Expo

OTA updates phone JavaScript and assets. Native modules, permissions, native configuration, and Wear
code require a new native build. Publish from a clean commit descending from the installed native build:

```powershell
npm.cmd run ota:publish -- --dry-run --message "Describe the tested update"
npm.cmd run ota:publish -- --message "Describe the tested update"
```

The dry run validates ancestry, runtime, native fingerprint, channel, and the EAS environment contract.
It contacts Expo to inspect configuration but does not publish. The second command publishes.
The default baseline comes from the last native build; use `--baseline <file>` for a retained baseline
from the build actually installed on your devices. Do not replace it with metadata from a build those
devices have never received.

Setup installs the reviewed EAS CLI. Authenticate it once from `mobile`:

```powershell
Push-Location mobile
..\tools\eas-cli\node_modules\.bin\eas.cmd login
..\tools\eas-cli\node_modules\.bin\eas.cmd project:info
Pop-Location
```

For unattended use, set `EXPO_TOKEN` and add `--non-interactive`. No signing keystore or Play credential
is needed for OTA. The default local channel is the baseline's `internal` channel and uses EAS
environment `preview`. `--channel` must match the baseline; `--environment` selects the EAS environment
whose public project/origin values are checked. Preserve the existing linked Expo project.

A successful publish proves the update is available through Expo. Devices still need to download it
and fully close/reopen the phone app to apply it. The Wear app is unchanged.

## Command migration and maintainer tools

| Previous root script | Supported replacement |
| --- | --- |
| `setup:native` | `npm.cmd run native:setup` |
| `prepare:native:release` + `build:native:release` | `npm.cmd run native:build` |
| `release:native:internal build / submit` | `native:build`, `native:submit` |
| `release:native:internal doctor / status` | Prerequisite checks: `native:setup -- --check`; upload readback is included in `native:submit`. Existing diagnostic workers remain available directly under `scripts/`. |
| `release:native:internal prepare` | [Native version metadata](#native-version-metadata) |
| `release:native:devices` | `npm.cmd run native:build`, then `npm.cmd run native:install` |
| `release:native:ota` | `npm.cmd run ota:publish` |
| `release:native:prepare` / `release:native:play` | [Protected store maintainer guide](native-store-release.md) |
| `release:native:evidence` | [Commit-specific physical validation](physical-galaxy-validation.md) |

The old root aliases are removed. Node workers under `scripts/` remain for isolated CI stages and
specialist evidence/recovery procedures. They are not additional steps in the local workflow.
