# Local Android and Expo releases

Start with the [deployment guide](deployment.md) to choose server, native, OTA, or protected production publication.
This reference covers the local internal profile. Run commands from the repository root; examples use Windows
PowerShell's `npm.cmd` (`npm` on other hosts).

| Goal | Command |
| --- | --- |
| Build and submit phone + Wear to Play internal | `npm.cmd run native:release` |
| Build only for device testing/manual upload | `npm.cmd run native:build` |
| Install retained APKs on phone + watch | `npm.cmd run native:install` |
| Submit a tested build or retry an upload | `npm.cmd run native:release -- --skip-build` |
| Publish compatible phone JavaScript/assets | `npm.cmd run ota:publish -- --message "Describe the update"` |

Configure credentials and tools once with `native:configure` and `native:setup`. A release requires a clean committed
candidate with unused native version codes. Build/sign/verify/upload/readback are included in `native:release`;
there are no manual intermediate stages. Installation and OTA are optional separate operations. Run applicable
application tests before distribution; artifact verification is not a device-behavior test.

The fixed local profile uses application ID `net.darkmachines.healthtracker`, server
`https://calibratehealth.darkmachines.net`, Expo project `@calibrate-health/calibrate-health-app`
(`fda8f8c5-e646-47ac-82fb-35003c9cbec7`), channel `internal`, and Play tracks `qa` / `wear:qa`.
Devices need WireGuard. Public releases/promotions use the [protected store workflow](native-store-release.md).
For first-upload Console/account setup, follow [Play onboarding](android-internal-testing.md).

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
EAS stores the key; native release submission uses our local Play API publisher, without EAS Submit.

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
`native:release -- --service-account-file <file>` override the saved paths without changing them.
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

## Release through Play API

After Console onboarding, commit the intended source and unused native version codes, then:

```powershell
npm.cmd run native:release
```

The command resolves both configured credential paths before building, runs the same `native:build` worker,
then re-verifies and submits its AABs. Signing and Play credentials are opened only in their separate consuming
stages. A failed build stops before upload. It never installs to devices, publishes OTA, or promotes to closed/production.

Check Publishing overview and coordinate other Console/API writers before starting: Play commits can include
pending changes for the same application. Submission supplies the internal worker's Console-coordination
acknowledgement; there is no confirmation flag or prompt.

If you already built/tested the packages, or submission failed after a successful build:

```powershell
npm.cmd run native:release -- --skip-build
```

Keep the same clean source and all retained outputs. This verifies the existing artifacts before Play authentication,
uploads phone/Wear to `qa` / `wear:qa`, and reads back versions and hashes. No separate status command is needed.
It rejects stale/changed artifacts rather than rebuilding or re-signing them. `--skip-build` needs only the Play
credential; `--credentials-file` is rejected in that mode. Enroll testers through Console opt-in links and update
both form factors through Play.

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

## Maintainer tools

`native:submit` is replaced by `native:release -- --skip-build`. Use plain `native:release` when building and submitting
together. See `npm.cmd run <script> -- --help` for options.

Node workers under `scripts/` remain for isolated CI stages, version maintenance, and specialist recovery/physical
validation. They are not additional steps in the local release workflow.
