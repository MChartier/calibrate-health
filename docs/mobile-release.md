# Android internal release

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

`shared/release.json` is the cross-platform source of truth; see `docs/release-compatibility.md` for the compatibility
policy and artifact metadata format. The native phone values mirror it in `mobile/app.json`:

- `expo.version` is the user-visible semantic version.
- `expo.android.versionCode` is the monotonically increasing Android build number.

Every Play-distributed candidate, including a recovery build, gets a new stable semantic `version` and a higher
`versionCode`. Use at least a patch bump even when the fix has no user-visible feature. Commit both before building
so the signed annotated `native-vMAJOR.MINOR.PATCH` tag identifies exactly one candidate commit. Google Play and
Android reject an upgrade whose version code is not greater than the installed build.

Phone and Wear are two artifacts in one Play application, so their version codes must also be globally unique. The
repository permanently assigns odd codes to phone and even codes to Wear. Prepare a paired store candidate with:

```powershell
npm.cmd run release:native:prepare -- --bump patch
```

Use `minor` or `major` when the user-visible native version warrants it; use `patch` for every other candidate. The
command leaves the server/web version alone, allocates the next odd/even code pair above both current codes, reserves
`native-vMAJOR.MINOR.PATCH`, and
updates the checked-in phone, Wear, pairing, diagnostic, OpenAPI, generated-client, package, and lockfile mirrors as
one validated batch. Review and merge those metadata changes with the native code being released; do not prepare the
next native version until the current native tag has been published. The prepare command treats `origin` as the
authority: it reads the exact remote `native-v*` refs, fetches the expected tag when it is absent locally, rejects a
local-only or mismatched tag, and requires the published tag commit to be on `origin/master` and in the current
checkout's ancestry. It also verifies the annotated tag object's SSH signature against the reviewed public keys in
`.github/native-release-tag-allowed-signers`, its internal tag name against the requested ref, and its peeled/direct
target against the exact source commit. Lightweight, unsigned, malformed, wrong-key, and wrong-target tags fail
closed.

Run `npm.cmd run release:check` after every version change. It also verifies the backend package, generated Android
project when present, Wear app, pairing module, application ID, global version-code lanes, and EAS profile names
without invoking a native build.

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

Run preparation from the repository root before setting any `CALIBRATE_ANDROID_*` signing variables and while
`$env:RUNNER_TEMP\\calibrate-android-upload.keystore` is absent:

```powershell
npm.cmd run prepare:native:release
```

Preparation fails closed if signing variables or the fixed temporary keystore are already present. It runs the clean
Expo prebuild, restores the reviewed phone Gradle wrapper, verification metadata, and dependency locks, verifies every
restored phone file and the independent checked-in Wear state against the reviewed SHA-256 manifest, and removes only
the pinned Gradle 8.14.3 distribution cache.

Then set the signing environment described above and build only the already-prepared projects:

```powershell
npm.cmd run build:native:release
```

The prepared build never runs Expo prebuild. It fails before Gradle unless HEAD is a clean lowercase 40-character
commit, the prepared phone and Wear wrapper/lock/verification state still matches the reviewed manifest, signing is
complete, and the configured origin is a credential-free HTTPS origin. It removes the exact Gradle 8.14.3 distribution
cache again immediately before the wrappers, then builds APK and AAB artifacts for phone and Wear with the same signing
identity. The release workflow supplies a larger Gradle heap and metaspace allowance for Expo release lint, removes
stale final artifacts before each build, and fails immediately if Gradle does not recreate all four canonical outputs:

- `mobile/android/app/build/outputs/apk/release/app-release.apk`
- `mobile/android/app/build/outputs/bundle/release/app-release.aab`
- `wear/app/build/outputs/apk/release/app-release.apk`
- `wear/app/build/outputs/bundle/release/app-release.aab`

Only after all four files exist, the build writes ignored `build/native-release-provenance.json`. This v1 sidecar
binds their repository-relative paths, sizes, SHA-256 values, application ID, and versions plus the release-manifest
hash to the source commit. Strict diagnostic capture rejects a missing sidecar, a different source commit, or any manifest or
artifact mismatch.

The retained observation inspects every artifact independently: APK package/version metadata comes from `aapt`, AAB
package/version metadata comes from bundletool, APK signers come from `apksigner`, and AAB signers come from
`keytool -printcert -jarfile`. It records canonical repository-relative paths, byte counts, SHA-256 digests,
application IDs, version names/codes, and signer SHA-256 values, then requires one signer across all four. Do not
infer AAB metadata or signer identity from its matching APK or retain an absolute build path.

## Publish and install through Google Play

The manual **Native Android Store Release** workflow is the canonical no-cable distribution path. It is separate from
the server/web release and Expo OTA workflows and has four explicit operations:

1. `upload-internal` requires the requested source to be the exact current protected `master` commit after
   `native-release-signing` admission, builds the phone and Wear release artifacts once with the shared upload
   certificate and the Expo `production` channel, verifies the provenance and common signer, then emits only the AAB
   hashes after signing credentials are scrubbed. A separate source-free job downloads and rehashes those AABs,
   constructs the canonical native Play receipt, and attests its exact bytes. The Play publisher independently
   reconstructs and verifies the same receipt before admitting Play authentication or uploading both AABs in one
   Google Play edit. Phone goes to `qa`; Wear goes to `wear:qa`, the
   [Publisher API identifiers for internal testing](https://developers.google.com/android-publisher/tracks). Only after
   Play accepts both does the workflow sign and publish the annotated `native-vMAJOR.MINOR.PATCH` source tag.
2. `recover-internal` handles the narrow case where Play accepted both bundles but the original workflow could not
   finish or create the tag. It reads exact singleton track state, version codes, and AAB SHA-256 values back from
   Play, commits no edit, and rebuilds nothing. It reconstructs the canonical receipt solely from those Play
   observations, removes and blanks Play authentication, and only then verifies the original receipt attestation.
   A release name is an exact state check, not provenance: a name-only or hash-swapped record reconstructs bytes with
   no matching attestation and fails before the protected tag.
3. `promote-closed` requires that same source commit and signed tag, verifies both exact version codes on their internal
   tracks, and moves them to the custom closed tracks `closed` and `wear:closed` in one edit. It never rebuilds or
   downloads a workflow artifact.
4. `promote-production` requires that same source commit and signed tag, verifies that both exact version codes are
   completed on their closed tracks, and moves them to `production` and `wear:production` in one edit. It never
   rebuilds or downloads a workflow artifact. The `play-production` GitHub environment is the public release approval
   gate.

The signed annotated tag is the authoritative native-release attestation. Upload/recovery, both promotion operations,
**Publish prepared release**, and origin-authoritative `release:native:prepare` all verify the tag object's signature
with verifier code pinned to the reviewed workflow SHA and the allowed-signers trust set freshly checked out from the
exact current protected `master` commit, plus the exact tag name and exact peeled target SHA. Each run records that
trust-set commit, so rerunning an older workflow cannot restore a key revoked on current `master`.
Origin-authoritative local preparation likewise fetches exact `origin/master` and reads the allowlist blob from that
resolved commit rather than trusting the working tree's copy. A commit signature is not a substitute for the
tag-object signature. Repository tag rulesets reduce the
chance of accidental or hostile ref changes, but are defense-in-depth: GitHub's read-only Rulesets API omits bypass
actors, so workflow inspection of those rules cannot be the sole attestation boundary. A pre-created ref provides no
readiness evidence unless its annotated tag object passes the same signature, name, and target checks.

Every credential-bearing native job re-resolves the live `refs/heads/master` through the read-only GitHub API after
its environment approval and requires that commit to equal the job's exact `job.workflow_sha`. This deliberately
revokes historical reruns when `master` advances, including a job that waited for approval. `GITHUB_SHA` and
`GITHUB_REF` are not freshness evidence because GitHub preserves the original run values during a rerun.

The receipt binds the repository, application ID, exact source, native tag and version, and fixed phone/watch role,
internal-track, version-code, and AAB-SHA-256 tuples. Its source-free attester is the only native Play job with OIDC
and `attestations:write`; it has no environment, Play credential, Android upload key, native-tag key, or tag-push key.
Immediately before the pinned attestation action it requires the source, workflow SHA, and freshly resolved protected
`master` to be identical. Publisher and recovery use a checksum-pinned GitHub CLI, cap each lookup at 100 results,
deny self-hosted signers, and require the exact repository and
`.github/workflows/native-release.yml@refs/heads/master`. Signer, build-config, source, and `githubWorkflowSHA`
digests must all equal the original source commit.

Historical recovery also requires the source to remain an ancestor of freshly resolved protected `master`, contain
the post-hardening receipt marker, and pass the policy read from current `master`. Add `revoke FULL_LOWERCASE_SHA` to
`.github/native-play-attestation-trusted-workflow-shas` to stop a suspect signer revision immediately. Critical
release-tooling drift fails closed unless the historical revision is explicitly retained. After reviewing the full diff of
every critical path exported by `scripts/native-play-receipt.mjs`, add `allow FULL_LOWERCASE_SHA` only for the narrow
historical recovery window, then remove that allow entry when the window closes. A matching `revoke` is authoritative
and always wins.

Receipt recovery also depends on GitHub's attestation store. Lookup is deliberately bounded to 100 results and fails
closed when no exact subject/certificate evidence is available, including after that evidence is deleted or otherwise
unavailable. A historical source cannot mint replacement evidence because the attester requires source, workflow,
and live protected `master` to be identical. Use a fresh higher odd/even pair and new upload instead of weakening or
reissuing the historical proof.

This makes Play internal testing the installation path for owned phone/watch devices and promotes the tested store
bundles unchanged. The three-day GitHub artifact is diagnostic/retry material only; it is not the installation
channel. Because the promotable phone bundle embeds Expo channel `production`, a Play internal tester receives
production-channel OTA updates after their protected approval. Expo channel `internal` remains for separately built
internal-channel clients and is not selected by this Play bundle.

After the native version PR is merged:

1. Copy its full merge commit SHA.
2. In Play Console, verify **Publishing overview** has no unrelated changes ready to send. Pause Console edits and all
   other Publisher API writers until the workflow finishes: Google documents that committing an API edit submits
   [every Console change already ready for review](https://developers.google.com/android-publisher/concurrency-considerations),
   while a concurrent Console change invalidates the active edit.
3. Open **Actions > Native Android Store Release > Run workflow** on `master`, choose `upload-internal`, enter that
   SHA, and check `confirm_play_console_clean`.
4. Join the Play internal test, then install Calibrate from Google Play on the phone and watch. An in-place update
   works only when the installed app uses Play's app-signing certificate; see the first-install migration below.
5. After the internal pair behaves correctly, repeat the Publishing overview check, then run the workflow with the
   same SHA, `promote-closed`, and the confirmation checked.
6. Add the device account to the closed tester list or Google Group. Per [Google Play's testing eligibility rules](https://support.google.com/googleplay/android-developer/answer/9845334),
   that account must opt out of the internal test and then opt in through the closed track's shareable link;
   internal-test opt-ins are not eligible for closed releases. Confirm Play shows the same phone/Wear version codes
   before counting the closed test.
7. Complete the account-required closed test with the unchanged pair. Repeat the Console check, then run the workflow
   with the same SHA and `promote-production`; approve the waiting `play-production` deployment.

If `upload-internal` fails after Play may have committed, rerun the failed jobs in that original workflow only while
its exact artifact is retained **and** current `master` still equals that run's workflow revision. Once `master`
advances, the old run is intentionally revoked: dispatch current `recover-internal` with the same source SHA and
Console confirmation. That read-only path reconstructs the durable source-to-Play-digest receipt and can complete the
tag only when those exact reconstructed bytes have their original independent attestation. It trusts neither a
non-reproducible rebuild nor a mutable release name. If Play never accepted the version codes, dispatch a fresh
`upload-internal` for the new exact current-`master` source.

There is no adoption path for a Play version published before receipt attestation was introduced. A legacy pair has
no independently issued pre-Play receipt, so `recover-internal` fails closed even when its names, codes, and hashes
are visible. Prepare a fresh higher odd/even phone/Wear pair on current `master` and run a new `upload-internal`.

### First Play installation and signing migration

Android accepts an in-place update only when the installed and incoming APKs use the same app-signing certificate.
During Play App Signing enrollment, either provide the existing permanent app-signing key so Play-delivered builds
retain the installed identity, or uninstall the existing local/debug build once and reinstall from Play, accepting
the loss of that app sandbox's local sessions and queued data. Back up or sync needed data first.

The workflow-produced APKs and AABs use the upload key. When Play uses a distinct app-signing key, an upload-key APK
cannot update a Play-installed app and a Play APK cannot update an upload-key-installed app. Use Play itself for
routine installs after migration; keep direct APKs only for explicitly separate test-device flows.

The offline planner needs no credentials or artifacts and catches source/tag/version-lane mistakes before dispatch:

```powershell
$nativeSource = git rev-parse HEAD
npm.cmd run release:native:play -- plan --source-commit $nativeSource
```

### Deferred Play and GitHub setup

The workflow is intentionally safe to merge before account setup. It fails closed with the missing configuration and
cannot publish anonymously. Complete these one-time tasks when the Play account and permanent keys are ready:

- Create or adopt the Play application `app.calibratehealth.mobile`, finish its required listing/policy setup, enable
  the Wear OS form factor, enroll it in Play App Signing, and create custom closed-testing tracks with API aliases
  `closed` for phone and `wear:closed` for Wear. Configure their tester list or Google Group and retain the closed
  opt-in link. Any Console-required first upload or testing enrollment remains an onboarding task; automation does
  not create the app listing, tracks, or tester groups.
- Create GitHub environments `native-release-signing`, `play-internal`, `play-production`,
  `native-release-attestation`, and `native-release-tags`. Protect `native-release-signing` and
  `play-production` with required reviewers and appropriate branch/deployment rules. Limit all five environments to
  deployments from `master`. Verify these policies before storing any signing, Play, App, or attestation credential.
- Create two active repository tag rulesets targeting exactly `refs/tags/native-v*` before storing the native tag
  credentials:
  - `native-release-tag-creation` enables **Restrict creations** and grants bypass only to the dedicated GitHub App
    described below.
  - `native-release-tag-immutability` enables **Restrict updates** and **Restrict deletions** with an empty bypass
    list.
  Verify the bypass lists in repository Settings and audit/remove any pre-existing unverified `native-v*` tag before
  enabling the rulesets. The workflow checks the visible active-rule shape before any build or Play call, but the
  read-only API does not reveal bypass actors. Treat these rules as defense-in-depth; the pinned public-key signature,
  exact tag name, and exact target verification are the authoritative readiness proof. Ordinary `GITHUB_TOKEN`
  writers should be unable to create, move, or delete the marker, and the App can push only an already-signed object
  after Play acceptance or durable recovery.
- Create two distinct Android Publisher service-account identities scoped only to this application. Per
  [Google Play's permission definitions](https://support.google.com/googleplay/android-developer/answer/9844686),
  grant the testing identity **View app information (read-only)** and **Release apps to testing tracks**, but never
  production release permission. Grant the production identity **View app information (read-only)** and
  **Release to production, exclude devices, and use Play App Signing**. Do not reuse either identity or key across
  the two GitHub environments; this separation makes the `play-production` approval a real security boundary.
- Store `CALIBRATE_ANDROID_UPLOAD_KEYSTORE_BASE64`,
  `CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD`, `CALIBRATE_ANDROID_SIGNING_KEY_ALIAS`, and
  `CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD` only as `native-release-signing` environment secrets. During migration,
  remove all four unchanged secret names from the legacy `play-internal` environment and from repository or
  organization scope before adding them only to `native-release-signing`; otherwise a missing environment secret
  could silently fall back to a broader copy. The decoded file exists only in the runner temporary directory. Do not
  place Android upload-signing material in either Play environment.
- Store the testing identity only as `GOOGLE_PLAY_TEST_SERVICE_ACCOUNT_JSON_BASE64` in `play-internal`, and the
  production identity only as `GOOGLE_PLAY_PRODUCTION_SERVICE_ACCOUNT_JSON_BASE64` in `play-production`.
  Before installing these scoped credentials, delete the legacy `GOOGLE_PLAY_ACCESS_TOKEN` and
  `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` secrets from both `play-internal` and `play-production` and from
  repository or organization scope; no old generic name may remain as a fallback.
  `GOOGLE_PLAY_TEST_ACCESS_TOKEN` and `GOOGLE_PLAY_PRODUCTION_ACCESS_TOKEN` are supported as short-lived recovery
  credentials only when the corresponding service-account secret is absent; a configured durable service account
  always takes precedence. Never commit any representation or place a production-capable credential in
  `play-internal`.
- Generate a dedicated CI-only, unencrypted (passphrase-less) SSH signing key for native release tags; the isolated
  noninteractive job intentionally has no passphrase or agent input. Protect the private key in secure owner storage
  and in the required-reviewer `native-release-attestation` environment. Replace the comment-only placeholder in
  `.github/native-release-tag-allowed-signers` with the reviewed public key in the documented
  `calibrate-native-release ssh-ed25519 ...` form, and store only the corresponding private key as the
  `NATIVE_RELEASE_TAG_SIGNING_PRIVATE_KEY_BASE64` secret in `native-release-attestation`. The placeholder deliberately
  trusts no key, so native release, promotion, OTA-readiness, and preparation checks fail closed until onboarding is
  complete. Never reuse this key interactively or put its private key in either Play environment or
  `native-release-tags`.
- Create a dedicated GitHub App installed only on this repository with **Contents: read and write**. Store its app ID
  as the `NATIVE_RELEASE_TAG_APP_ID` environment variable and its private key as the
  `NATIVE_RELEASE_TAG_APP_PRIVATE_KEY` secret in `native-release-tags`. This push-only environment must contain no
  Play credential, Android signing credential, or native-tag signing key. The attestation job signs the annotated tag
  without a write token; a separate job verifies that signed object and uses the short-lived App token to push it.
- Confirm Play App Signing serves both phone and Wear artifacts with the expected application signing certificate.
  The repository verifies their shared upload signer before submission; Play owns the final store signer. Resolve the
  first-install key migration described above before calling the Play install an in-place upgrade.

Play account creation, policy answers, store listing assets, tester enrollment, app-signing enrollment, service-account
authorization, environment protection, and secret entry are deliberately not automated by this repository change.

### Native tag signing-key lifecycle

For a planned rotation, first add the new public key to `.github/native-release-tag-allowed-signers` while retaining
the old key, review and merge that trust-set change, and verify current protected `master` contains both keys.
Then switch the workflow's `NATIVE_RELEASE_TAG_SIGNING_PRIVATE_KEY_BASE64` secret in
`native-release-attestation` to the new private key and verify a release tag signed by it. Remove the old public key in
a later reviewed change only after no supported
prepared release, promotion, or OTA baseline still depends on a tag signed solely by that key; removal intentionally
makes those old attestations fail closed. Public keys are not secrets, so retaining a retired but uncompromised key
during the support window is safer than breaking verification early.

If a signing key may be compromised, pause native release and OTA promotion, remove/disable the private-key secret,
remove the compromised public key from the reviewed allowlist, and audit every affected annotated tag object, peeled
target, Play receipt, and workflow run from the exposure window. Rotate the independent GitHub App credential only if
it was also exposed. Do not move an existing native tag to repair the incident; resume with a reviewed replacement key
and a higher native version after deciding which installed baselines remain supportable. Removing a compromised public
key on protected `master` immediately makes new runs and reruns reject it; it may block older recovery or OTA flows
by design until that incident decision is recorded.

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

Expo OTA updates apply to the Android and iOS mobile apps' JavaScript, styling, and bundled assets. Wear OS, native
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
the locked EAS CLI from `tools/eas-cli`. Before running it, install that tool with the command shown above. It refuses
a dirty working tree, a divergent Git history, a changed native
fingerprint, a runtime mismatch, or a different channel. Before bundling, it pulls the selected EAS environment and
requires `EXPO_PUBLIC_CALIBRATE_SERVER_URL`, `EXPO_PUBLIC_EAS_PROJECT_ID`, and `EXPO_UPDATES_CHANNEL` to match the
installed-build baseline; this prevents an EAS environment from silently redirecting a self-hosted app. Run it
interactively after signing in with the locked command above; automation can use `--non-interactive` with
`EXPO_TOKEN`. The default dogfood mapping
is channel `internal` with EAS environment `preview`; production builds and updates use `production` for both.

Release builds check for updates without blocking startup. After an update is downloaded, fully close and reopen the
phone app again to run it. Keep the signed native artifact: OTA is not a substitute for an installable recovery build,
and a native incompatibility must be corrected with a higher-version signed APK/AAB.

### Publish OTA updates from GitHub Actions

The `Publish Expo OTA Update` workflow is reusable by **Cut release** and also retains a manual recovery dispatch.
It is never triggered by an ordinary `master` push. Before GitHub opens the first environment approval, a preflight
with no Expo, environment, or publisher credential requires an exact full source commit on current protected
`master`, verifies the exact published signed annotated `native-vMAJOR.MINOR.PATCH` tag and its direct target with
workflow-SHA-pinned verifier code and the allowed-signers trust set from current protected `master`, and proves the
source descends from that native baseline. Its pinned checkout actions may use only the job's ephemeral read-only
checkout token; `persist-credentials: false` removes that authentication before source-owned commands run, and the
workflow does not pass the token to those commands. Every later job consumes the preflight's bound source/tag
outputs; no Expo token job can start if that proof fails. Expo access tokens are account/project scoped, not channel scoped, so a token able to publish
`internal` could also target `production`. Every token-bearing stage therefore
targets the master-restricted, required-reviewer GitHub `expo-publication` environment. GitHub approves environments
per job, so a complete run has four explicit approvals: resolve the internal EAS environment, publish internal,
resolve the production EAS environment, and publish production. The same project-wide token becomes available to
each approved source-free job. The later approvals enforce the reviewed workflow's sequencing; they do not prevent
someone who already obtained that token from targeting the production channel. A separate Expo project/account or a
channel-enforcing broker would be required for that stronger capability boundary. After image publication, the
pipeline publishes the exact release commit's Android phone JavaScript/assets to `internal` without waiting for
self-host deployment, then proceeds through the same protected workflow boundary for production. If the manifest
reserves a native tag that has not yet been created by a successful Play internal upload,
or its signed annotated tag does not verify with the workflow-SHA-pinned verifier against the allowlist fetched from
current protected `master`, exact name, and exact target, or its tagged build has a different app version/native fingerprint, the independent server/image release
succeeds and reports OTA as skipped. Rerun **Publish prepared release** only when that
prepared commit already records the compatible protected tag. Otherwise use this workflow's manual dispatch from the
exact compatible native source.

The already-published `v0.35.0` release is the one-time migration case: its immutable manifest names legacy
`v0.13.2`, whose installed native baseline is incompatible, so replaying **Publish prepared release** cannot repair
its OTA stage. After this PR merges, call the exact merge commit `C`, run **Native Android Store Release >
upload-internal** from `C`, and let Play acceptance create `native-v0.2.6` at `C`. The Play build already contains
the current 0.35.0 bundle. If a corresponding EAS publication is still wanted, manually run **Publish Expo OTA
Update** from `master` with `source_ref=C` and `native_build_ref=native-v0.2.6`; do not target immutable
`93ff7474521fd93456027df0729d8797e9c47b54`, whose source does not descend from the new native baseline. Future
prepared releases created after `C` use the normal compatible-tag recovery path.

Expo's automatic check and download lifecycle remains unchanged. `/api/v1/client-config` responds with
`Cache-Control: no-store`; server selection, startup before restoring a session or synchronizing, and manual
compatibility recheck also request it with Fetch `cache: 'no-store'`. When a downloaded bundle runs, the phone compares
its bundled expected server contract version with that response. Different majors block in either direction. Within a
major, an older client minor remains compatible with a newer server minor, but a newer client minor blocks against an
older server minor; patch drift remains compatible. The runtime block does not prevent the update from downloading or
starting. The protected production approval remains the operator control for public promotion. A future automated
promotion rule can require an explicit deployment-readiness signal for the release owner's declared server rollout;
independently managed self-hosts still rely on the runtime guard, and GitHub Actions must not poll private servers.

Before its first use:

1. Create the GitHub `expo-publication` environment, restrict it to the selected deployment branch `master` only,
   require an independent reviewer, and disable self-approval and administrator bypass. Verify those policies before
   storing a token. Remove repository-, organization-, and other environment-scoped `EXPO_TOKEN`,
   `EXPO_PREVIEW_TOKEN`, and `EXPO_PRODUCTION_TOKEN` values so a stale or branch-edited workflow cannot fall back to
   broader authority.
2. Create a dedicated minimally privileged Expo robot identity for this project and mint one access token for
   programmatic update publication. Expo does not provide a channel-scoped update role. The protected GitHub
   environment and current-workflow checks restrict when reviewed jobs receive the token, but the token itself can
   update either channel after release. Only after step 1 is verified, save the token as `EXPO_RELEASE_TOKEN` in
   `expo-publication`; never store it at repository or organization scope. Until this exact policy and secret exist,
   OTA publication is intentionally unavailable.
3. Configure the Expo `preview` EAS environment with `EXPO_PUBLIC_CALIBRATE_SERVER_URL`,
   `EXPO_PUBLIC_EAS_PROJECT_ID`, and `EXPO_UPDATES_CHANNEL=internal`.
4. Configure the Expo `production` EAS environment with the same project/server values and
   `EXPO_UPDATES_CHANNEL=production`.
5. Build and install the phone binary from a known `master` commit with the same channel/environment you intend to
   update.

For standalone recovery, open **Actions > Publish Expo OTA Update > Run workflow**, select `master`, and provide:

- `source_ref`: the exact full commit to bundle. It must be on `master` and descend from the native build ref.
- `native_build_ref`: the exact signed, published `native-vMAJOR.MINOR.PATCH` tag shown in **Settings > About
  Calibrate** for the installed phone apps on the internal and production channels. Commits, branches, revision
  expressions, lightweight tags, and unsigned tags are rejected.
- `message`: a short description shown in EAS Update history.

The preflight, which has no publisher credential, and both source-build jobs check out the exact commit selected at
dispatch. The preflight uses only non-persisted read-only checkout authentication and rejects the commit unless it is on
current protected `master` and descends from the signed `native_build_ref`;
the build jobs then pull and validate the selected EAS environment artifact and compare the update source with the
installed native build. The `appVersion` and native fingerprint
must both match exactly. Any app-version, native dependency, config plugin, icon, Wear source, or other native input
change stops the publish and requires a new signed phone/Watch build. The fingerprint is normalized to those native
inputs: Expo/EAS config, native assets, config plugins, local native modules, Wear sources, and resolved packages that
contribute Android code. Server release policy, application JavaScript, root package metadata, and JS-only or
tooling-only dependency changes remain OTA-compatible. OTA updates never update the Wear app.

Approve each of the four `expo-publication` deployments only when this exact run is authorized to hold project-wide
Expo update authority:

1. resolve the internal EAS environment;
2. publish the internal update;
3. after internal testing, resolve the production EAS environment; and
4. publish the production update.

Reject or leave any stage pending if verification does not pass. The third and fourth approvals preserve operator
sequencing, but they do not revoke the production capability of the same token previously released to the first two
jobs.

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

If a release is bad, prepare a new patch native release and publish its higher odd/even version-code pair. Never move
an existing `native-vMAJOR.MINOR.PATCH` tag to a fixed commit. A lower-version APK is not a safe rollback for
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

## Owner-discretion distribution checklist

Use the checks below when they are relevant to an actual native distribution. The physical phone/watch protocol and
broader Play worksheet are optional confidence aids; repository automation does not require every box for pre-release
development.

- [ ] `npm.cmd run release:check`, `npm.cmd run test:release`, and `npm.cmd run test:native-release` pass.
- [ ] Run only the optional emulator, upgrade, OTA, or physical checks that are useful for this distribution.
- [ ] The source commit is clean and pushed before signing.
- [ ] `version` is correct; phone has the next odd `versionCode`, Wear has the next even code, and both exceed every
  code already allocated to either form factor.
- [ ] This semantic version and immutable native tag have not been used for an earlier store candidate.
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
- [ ] Before an OTA publish, run `release:native:ota -- --dry-run` and confirm no native fingerprint mismatch.
- [ ] Generate and retain the deterministic release metadata described in `docs/release-compatibility.md`.
- [ ] Keep the prior artifact and encrypted keystore backup, but distribute only the new higher-version build.
- [ ] If a physical result is retained, verify it locally against the source commit; no evidence-only child is needed.
