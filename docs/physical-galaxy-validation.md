# Optional physical Galaxy phone and watch validation

Use this protocol when a real phone/Watch check would provide useful confidence for a native distribution. It covers
signed Android phone and Wear artifacts built from one source commit. It is not an automatic CI or release gate.

This document is a protocol, not proof that anyone performed it.

## Current status

As of the Launch 23 implementation PR:

- Repository contracts and hosted emulator/package jobs may be exercised in CI.
- No permanent release artifact has been built or signed by this work.
- No physical Galaxy phone or Galaxy Watch validation has been executed by this work.
- No OTA update has been published or verified on a physical release client by this work.
- No physical result is currently recorded.
- The risk inventory records physical coverage as a non-blocking diagnostic gap.

Keep issue `#303` open until the owner decides the physical coverage is worth completing.

## Source and privacy boundary

Use a clean, pushed source commit before signing. Build phone APK/AAB and Wear APK/AAB from it using the canonical
`shared/release.json` and one permanent signing identity. Any optional result must name that source commit.

A source, script, configuration, dependency, manifest, or documentation change after execution makes the prior
result historical. Repeat only the checks affected by the change when the owner wants renewed confidence.

## Privacy boundary

Use only a synthetic Calibrate account. ADB and hardware serials are transient command inputs. Do not record or
attach the capture command line or raw console output. Serials must never enter the retained observation, result,
risk manifest, screenshots, or PR text.

The repository-safe v3 result may retain only:

- C, the SHA-256 of C's canonical release manifest, and the exact candidate-bound build provenance record;
- canonical repository-relative artifact paths, byte counts, artifact SHA-256 values, application ID, versions, and
  independently inspected signer SHA-256 values;
- phone/watch role, fixed handset/watch device class, Samsung manufacturer/model, OS version, API level, and
  physical/emulator booleans;
- strict pre/post upgrade version, first-install-time, and signer continuity;
- exact allowlisted checkpoint command ID, capability ID, and boolean outcome records plus derived capabilities.

Do not retain absolute paths, device or ADB serials, email/account identifiers, health values, food names, tokens,
request payloads, keystore data, passwords, reviewer credentials, private Console URLs, or raw `adb`/`logcat`
output. The finalized JSON is the repository evidence; keep scratch files, raw console output, and access-controlled
Play records outside the repository.

## Prerequisites

- C is checked out, clean, pushed, and recorded as a lowercase 40-character SHA.
- The candidate server is available at its reviewed credential-free HTTPS origin and has a verified backup.
- The phone is a physical, non-emulator Samsung handset whose build characteristics explicitly identify a phone,
  handset, or default device; tablet, TV, automotive, embedded, empty, or otherwise ambiguous characteristics fail.
- The watch is a physical, non-emulator Samsung watch and is already paired through Android.
- The previously installed phone and Wear versions are strictly lower than C and use the same permanent signer.
- The four canonical C artifacts exist at the paths documented in `docs/mobile-release.md`.
- The official bundletool all-in-one JAR is stored outside the repository and the current PowerShell session sets
  `BUNDLETOOL_JAR` to its absolute file path.
- Phone APK, phone AAB, Wear APK, and Wear AAB independently report one signer SHA-256.
- Candidate version names/codes and application ID match `shared/release.json`.
- The phone and watch are safe to use with a synthetic account; no personal values will be captured.
- A temporary path outside the repository is available for the sanitized observation and checkpoint files.

Set and validate the path before capture; this protocol does not install or download bundletool:

~~~powershell
$env:BUNDLETOOL_JAR='C:/Tools/bundletool-all-<version>.jar'
if (-not (Test-Path -LiteralPath $env:BUNDLETOOL_JAR -PathType Leaf)) {
  throw 'BUNDLETOOL_JAR must name the downloaded official bundletool all-in-one JAR.'
}
~~~

Do not use `--replace-incompatible`, uninstall either app, clear app data, lower a version code, or switch the
application ID/signer. Those actions invalidate upgrade evidence.

## Automated and hosted gates

Run the repository contract suite on C:

~~~powershell
npm.cmd run release:check
npm.cmd run test:release
npm.cmd run test:native-release
npm.cmd run test:risk-evidence
~~~

The pull-request workflow also defines:

- `android-emulator-e2e` - `npm run test:android:e2e` on an explicit Android phone emulator;
- `wear-release-emulator-smoke` - `npm run test:wear:emulator` on a disposable-signed non-debuggable Wear build;
- `native-package-upgrade` - package-only phone/Watch in-place upgrade using two emulators and a disposable signer.

These jobs are required package/runtime evidence. They do not prove the permanent signer, physical hardware,
interactive state preservation, or physical OTA behavior. Their temporary ADB serials and raw upgrade result are not
uploaded.

Run the operator forms of `test:android:e2e`, `test:wear:emulator`, and `test:native:upgrade` when preparing the
release record. Mark `gate-native-release`, `gate-android-emulator`, `gate-wear-emulator`, and
`gate-native-upgrade` true only for successful C-specific outcomes.

For OTA, first run the dry-run command from `docs/mobile-release.md`. Then publish only to the intended internal
channel, allow the installed C phone client to download it, fully close/reopen, and confirm the compatible update is
active without changing native identity or Wear. Mark `gate-ota` true only after that operator path passes. A unit
contract or dry run alone is insufficient.

## Capture the signed candidate

Build the four permanent-signed artifacts from clean C. A successful build writes the ignored, repository-owned
`build/native-release-provenance.json` sidecar only after all four outputs exist. The v1 sidecar contains exactly
`schemaVersion`, `sourceCommit`, canonical release-manifest path/hash, and four artifact records with fixed
ID/role/format/path, size/hash, application ID, and version. Then use explicit transient targets to install with
`adb install -r` and write a serial-free v2 temporary observation:

~~~powershell
$candidateCommit = git rev-parse HEAD
$observationPath = Join-Path $env:TEMP 'calibrate-native-observation.json'

npm.cmd run build:native:release
npm.cmd run release:native:devices -- `
  --skip-build `
  --phone-serial '<transient phone adb serial>' `
  --watch-serial '<transient watch adb serial>' `
  --candidate $candidateCommit `
  --evidence-observation $observationPath
~~~

Evidence mode must fail unless HEAD equals clean C, the sidecar exists and its source/manifest/four artifact hashes
match C and the independently inspected bytes, the phone has handset-compatible characteristics, both explicit
targets are physical Samsung devices, both installed versions are lower and same-signer, and both upgrades use
`adb install -r` without uninstall or data clearing. It also fails closed if `BUNDLETOOL_JAR` is absent or either
AAB manifest package/version cannot be parsed and matched to the candidate `shared/release.json`. It writes facts;
it does not convert unperformed behavior into passing checkpoints.

## Physical checkpoint protocol

Perform these with synthetic data. Retain only each checkpoint's fixed command ID, fixed capability ID, and boolean
outcome; never retain observed values, argv, command output, serials, or free-form command text.

### Phone happy path

- `phone-authentication`: register/sign in, restart, and confirm the selected server and session survive.
- `phone-onboarding`: complete required profile and goal setup and reach the authenticated application.
- `phone-today`: verify date navigation, calorie budget, meal groups, completion state, and restart recovery.
- `phone-food-create`: create a manual food log and confirm server/web convergence.
- `phone-food-edit`: edit amount/serving/meal and confirm the immutable snapshot behavior is correct.
- `phone-food-delete`: delete a synthetic entry and confirm it is gone on both clients.
- `phone-food-undo`: undo the supported food action and confirm exactly one restored server mutation.
- `phone-food-copy`: copy a meal/day to a selected date and confirm no duplicates.
- `phone-barcode`: grant camera from the barcode disclosure, scan a supported synthetic product, and log it.
- `phone-weight`: add and replace a synthetic weight and confirm local-day grouping.
- `phone-trend`: verify the weight trend and goal projection use the new point without exposing raw values.
- `phone-notifications`: exercise permission, in-app state, deep link, and phone/watch reminder deduplication.
- `phone-health-connect`: connect only intended read types, test partial revoke/regrant and recovery, preserve source
  attribution, and confirm activity does not alter the fixed calorie target.
- `phone-session-revocation-cleanup`: revoke a synthetic session and confirm credentials/subscriptions for that
  session stop working without exposing another account.
- `phone-account-deletion-cleanup`: as the final flow for a disposable account, delete it and confirm server rows,
  phone credentials/outbox/Health Connect state, notification subscription, and reachable watch account cache clear.
- `phone-in-place-upgrade`: confirm session, selected server, settings, cache, and pending outbox survive the
  same-signer higher-version `adb install -r` upgrade.

### Phone offline and isolation

- `phone-offline-replay-once`: queue a write, force-stop, reconnect, relaunch twice, and prove one server mutation.
- `phone-offline-account-isolation`: switch/revoke the synthetic account around queued work and prove it cannot replay
  into another account.
- `phone-offline-server-isolation`: switch the selected server around queued work and prove it cannot replay to a
  different server.

### Watch happy path

- `watch-pairing`: pair from the exact retained phone/account/server and reject stale or wrong-node attempts.
- `watch-snapshot`: confirm current summary, foods, weight, activity, completion, and stale state converge.
- `watch-supported-handoffs`: exercise only allowlisted continue-on-phone and legal destinations on the paired phone.
- `watch-session-revocation-cleanup`: revoke the watch session and confirm credentials/cache/outbox no longer operate.
- `watch-account-deletion-cleanup`: delete the disposable account and confirm reachable/unreachable recovery guidance
  and eventual local credential/cache/outbox cleanup.
- `watch-in-place-upgrade`: confirm pairing, bounded cache, Room state, and outbox survive the same-signer
  higher-version `adb install -r` upgrade.

Also exercise Tile, rotary input, round-screen scrolling, ambient/stale states, notification deep links, and reminder
deduplication as supporting watch observations.

### Watch offline and recovery

- `watch-offline-replay-once`: queue an action with phone transport and watch network absent, restart, reconnect, and
  prove one server mutation.
- `watch-offline-recovery`: restore phone transport or watch networking and confirm bounded refresh, cache recovery,
  and the correct account/server scope.

Any failure leaves its checkpoint false and invalidates the affected derived capability. Fix the defect, freeze a new
C and higher version when needed, then repeat the full affected online/offline path.

## Finalize the repository-safe result

Create a temporary JSON object containing every checkpoint key above plus the five `gate-*` keys. Every value must
have exactly `commandId`, `capabilityId`, and boolean `outcome`. Physical command IDs are
`protocol-<checkpoint-key>`; their capability ID is the enclosing one of `android-physical-happy-path`,
`android-physical-offline-reconnect`, `wear-physical-happy-path`, or
`wear-physical-offline-reconnect`. Gate capability IDs are `release-gates`, with these fixed command IDs:

- `gate-native-release`: `repo-test-native-release`
- `gate-android-emulator`: `repo-test-android-e2e`
- `gate-wear-emulator`: `repo-test-wear-emulator`
- `gate-native-upgrade`: `repo-test-native-upgrade`
- `gate-ota`: `repo-release-native-ota`

For example:

~~~json
{
  "phone-authentication": {
    "commandId": "protocol-phone-authentication",
    "capabilityId": "android-physical-happy-path",
    "outcome": true
  },
  "gate-native-release": {
    "commandId": "repo-test-native-release",
    "capabilityId": "release-gates",
    "outcome": true
  }
}
~~~

Include every allowlisted key, not just these examples. Finalization rejects missing/unknown keys, extra record fields,
incorrect enum IDs, or non-boolean outcomes; requires every gate to pass; and derives the four physical capabilities
instead of trusting self-asserted capability text.

~~~powershell
$checkpointPath = Join-Path $env:TEMP 'calibrate-native-checkpoints.json'
$resultPath = 'quality/physical-results/galaxy-YYYY-MM-DD.json'

node scripts/native-release-evidence.mjs finalize `
  --observation $observationPath `
  --checkpoints $checkpointPath `
  --output $resultPath `
  --owner '<operator GitHub handle>' `
  --executed-on 'YYYY-MM-DD' `
  --synthetic-account
~~~

Add one `physicalDeviceEvidence` record to `quality/risk-evidence.json` with exactly:

- a unique `id`, `riskArea: critical-client-workflows`, and `status: passed`;
- `owner`, `executedOn`, and `sourceCommit` matching the finalized result;
- `protocolPath: docs/physical-galaxy-validation.md`;
- the repository-relative `resultArtifact`;
- only the four capabilities derived in the result.

Remove `physical-galaxy-phone-and-watch-validation` only when the finalized result covers every physical capability.
Do not copy device metadata into the risk manifest.

## Verify the optional result

Verify the sanitized result against the source commit:

~~~powershell
node scripts/native-release-evidence.mjs verify `
  --result $resultPath `
  --candidate $candidateCommit
~~~

The result may be kept locally or committed as ordinary documentation. If it is added to
`quality/risk-evidence.json`, replace the matching `diagnosticGaps` entry only when all four physical capabilities are
covered. No second commit, receipt ledger, or release authorization step is involved.
