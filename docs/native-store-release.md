# Protected native store releases

This guide is for maintainers operating the GitHub release, signing, attestation, and production-promotion workflow. For local builds, manual uploads, device installation, and Expo OTA, start with [Local native builds and releases](mobile-release.md). Local artifacts cannot be adopted into this protected workflow; it requires a fresh higher native version pair.

## Versioning

`shared/release.json` is the cross-platform source of truth; see `docs/release-compatibility.md` for the compatibility
policy and artifact metadata format. The native phone values mirror it in `mobile/app.json`:

- `expo.version` is the user-visible semantic version.
- `expo.android.versionCode` is the monotonically increasing Android build number.
- `expo.ios.buildNumber` is the same mobile build counter as a string; release checks reject missing or stale values.
  Both mirror `android.mobile.version_code` in the manifest (the existing native mobile version namespace).

Every Play-distributed candidate, including a recovery build, gets a new stable semantic `version` and a higher
`versionCode`. Use at least a patch bump even when the fix has no user-visible feature. Commit both before building
so the signed annotated `native-vMAJOR.MINOR.PATCH` tag identifies exactly one candidate commit. Google Play and
Android reject an upgrade whose version code is not greater than the installed build.

Phone and Wear are two artifacts in one Play application, so their version codes must also be globally unique. The
repository permanently assigns odd codes to phone and even codes to Wear. Prepare a paired store candidate with:

```powershell
node scripts/release-config.mjs prepare-native --bump patch
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

The same preparation also advances `expo.ios.buildNumber` and the iOS diagnostic version window. EAS uses local
app version management, so this checked-in mobile counter must exceed previous Android and TestFlight uploads;
promoting an existing artifact does not allocate another counter. Apple distribution remains a separately signed native build.

Run `npm.cmd run release:check` after every version change. It also verifies the backend package, generated Android
project when present, Wear app, pairing module, application ID, global version-code lanes, and EAS profile names
without invoking a native build.

## Build workers

The GitHub workflow invokes two internal Node workers: `node scripts/native-release-build.mjs prepare` without credentials, then `node scripts/native-release-build.mjs build-prepared` with signing credentials admitted by its isolated stage. They are implementation details, not the local build interface. Keep these stages separate in CI. The prepared projects, Gradle wrappers, dependency locks, and verification metadata must match the reviewed integrity manifest. The build records all four APK/AAB hashes and source identity in `build/native-release-provenance.json`.

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
**Publish prepared release**, and origin-authoritative `prepare-native` all verify the tag object's signature
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
node scripts/native-play-release.mjs plan --source-commit $nativeSource
```

### Deferred Play and GitHub setup

The workflow is intentionally safe to merge before account setup. It fails closed with the missing configuration and
cannot publish anonymously. Complete these one-time tasks when the Play account and permanent keys are ready:

- Create or adopt the Play application `net.darkmachines.healthtracker`, finish its required listing/policy setup, enable
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

## Publish OTA updates from GitHub Actions

The `Publish Expo OTA Update` workflow is reusable by **Cut release** and also retains a manual recovery dispatch.
It is never triggered by an ordinary `master` push. Before GitHub opens the first environment approval, a preflight
with no Expo, environment, or publisher credential requires an exact full source commit on current protected
`master`, verifies the exact published signed annotated `native-vMAJOR.MINOR.PATCH` tag and its direct target with
workflow-SHA-pinned verifier code and the allowed-signers trust set from current protected `master`, and proves the
source descends from that native baseline. Its pinned checkout actions may use only the job's ephemeral read-only
checkout token; `persist-credentials: false` removes that authentication before source-owned commands run, and the
workflow does not pass the token to those commands. Every later job consumes the preflight's bound source/tag
outputs; no Expo token job can start if that proof fails. Expo access tokens are account/project scoped, not channel scoped, so a token able to publish
`internal` could also target `production`. The workflow uses the existing repository `EXPO_TOKEN` secret.
Internal environment resolution and publication run in `preview`; one reviewer approval in the existing GitHub
`production` environment gates production environment resolution, export, and publication after internal testing.
The four credential stages remain source-free, with dependency installation and export on separate runners.
This approval enforces workflow sequencing; it does not prevent someone holding the token from targeting production.
A separate Expo project/account or a
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

1. Configure the repository `EXPO_TOKEN` secret using the existing Expo project identity. No separate Expo robot or
   `expo-publication` environment is required. The token must have access to the project's update publication.
2. Keep the GitHub `preview` environment and the protected `production` environment with its required reviewer and
   branch policy. Production approval occurs after internal publication and before any production stage.
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

After validating the internal update, approve this run's single `production` deployment to resolve the production
EAS environment, export the production bundle, and publish it. Reject or leave that approval pending if internal
verification fails. The same project-wide token is used in both channels; the gate sequences the reviewed workflow
and does not revoke the token's production authority after internal use.

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
