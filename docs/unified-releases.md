# Selective release preparation

`Release changed artifacts` is the manual entrypoint for maintainers of the
managed Calibrate service. Its default **plan only** mode reports which server,
Android, iOS and compatible OTA artifacts differ from their last verified success.
Merging application code does not invoke this workflow. This guide describes
prepared automation; it is not evidence that a release or provider operation ran.

## Plan and execute

Select protected `master`, a build profile (`internal` or `production`), and a
server version bump. Leave **plan only** enabled to inspect the JSON summary.
The plan reports exact source and configuration digests, selected stages, reasons
and proposed versions. A no-change plan writes no journal, candidate or provider
request. The Android Play Console acknowledgement is required only when the
plan selects the existing paired Android upload worker.

After reviewing the plan and existing provider configuration, an authorized
operator can dispatch again with **plan only** disabled. This creates a fresh
plan at that exact source; the protected handler compares its read-only and
execution digests before writes. It verifies selected workflow availability and
allocation constraints before preparing metadata. Native metadata changes use
one exact candidate with the maintained base/head CI and tree guards. GitHub may
require a human to approve CI on a bot-created candidate PR; missing or failed
CI leaves that candidate recoverable and prevents provider dispatch.

Selected native and OTA stages finish before the separate server handoff. That
handoff retains the existing server-only candidate and image-receipt verifier.
Selective server publication does not implicitly deploy or launch another OTA
publication. Existing manual server recovery and local native build options
remain available.

## External build configuration

No production domain is selected in source. The operator supplies an explicit,
credential-free HTTPS origin through `CALIBRATE_NATIVE_SERVER_URL` for production
or `CALIBRATE_INTERNAL_SERVER_URL` for internal builds. New unified workflows read
the EAS project UUID from masked `CALIBRATE_EAS_PROJECT_ID` configuration, including
the paired Android worker. The separate legacy OTA entrypoint retains its public
repository-variable input of the same name; keep that value identical if it is
still used. Unified workflows use the secret form to keep project settings out
of workflow logs.

The selected EAS environment must agree with all three values:

| Build profile | EAS environment | Update channel |
| --- | --- | --- |
| `internal` | `preview` | `internal` |
| `production` | `production` | `production` |

The EAS environment supplies `EXPO_PUBLIC_CALIBRATE_SERVER_URL`,
`EXPO_PUBLIC_EAS_PROJECT_ID` and `EXPO_UPDATES_CHANNEL`. A channel selects an update
stream; it does **not** select a backend URL. The environment, endpoint, project,
profile, source and native fingerprint are bound together. A mismatch rejects
the build/export. Existing channel mappings must contain one active branch;
the worker never creates or remaps a channel or continues through a rollout.
The existing production/preview GitHub environment approval precedes environment
resolution, source export and publication. Each subsequent job requires the
preceding job to succeed; source export still has no provider credentials.

Backend targeting is build-time only. These endpoint/project values are embedded
in clients and are observable. They are not credentials. Temporary OTA exports
necessarily contain the public configuration and bundle; only their digests and
verified result identities enter durable release receipts. Raw EAS environment
contents, account names, Apple team settings and signing inputs are not retained
in those receipts. The managed-hosted application behavior is maintained by the
separate fixed-target client change; this tooling adds no runtime server picker.

Existing Expo authentication remains `EXPO_TOKEN`. Existing Apple team identity
is supplied as `APPLE_TEAM_ID`; account ownership, where needed locally, uses
`EAS_ACCOUNT`. Do not commit provider credentials or personal project settings.
This preparation neither creates credentials nor provisions a service.

## Native versions and iOS delivery

Android retains the paired phone/Wear allocation, signed native tags, original
image/signing trust policy and separated Play submission stages. An Android
selection still uses the existing internal-upload worker; production rollout
is a separate operator decision. Local `native:release`, retry and skip-build
options remain supported.

iOS uses `shared/ios-release.json` independently of Android's paired counters.
The candidate advances the iOS version, build number and maintained diagnostic
mirrors together. Native runtime identity is `ios-VERSION-BUILDNUMBER`; compatible
OTA exports retain the installed runtime rather than allocating another build.
The EAS CLI is locked to 22.4.0 and build requests freeze existing credentials.
Builds never automatically submit.

The stages have distinct outcomes:

1. **Build:** EAS produces an IPA. A separate macOS verifier downloads the exact
   bytes and checks the signature, provisioning, bundle identity, version, build
   number, runtime, project, channel and backend configuration. Only its attested
   receipt can advance the native baseline.
2. **Upload:** `iosSubmitRequest` prepares an explicit `eas submit --id BUILD_ID`
   request and external `ascAppId` configuration for an independently verified
   store build. It forbids latest/simulator/ad-hoc selection and automatic
   TestFlight setup. This pure preparation helper does not execute submission.
3. **TestFlight processing:** Apple processes an uploaded build before it becomes
   available. Export-compliance information and testing eligibility remain
   App Store Connect concerns; upload success is not processing success.
4. **Production rollout:** App Review and App Store release remain separate human
   operations. Neither an IPA nor an upload receipt proves a production release.

Apple's requirements effective April 28, 2026 require iOS uploads built with
Xcode 26 or later and the iOS 26 SDK or later. The selected named EAS image uses
Xcode 26.6; the downloaded IPA verifier checks its SDK metadata too. See
[Apple's requirements](https://developer.apple.com/news/upcoming-requirements/),
[Expo iOS build infrastructure](https://docs.expo.dev/build-reference/infrastructure/),
[EAS iOS submission](https://docs.expo.dev/submit/ios/) and
[TestFlight delivery](https://docs.expo.dev/submit/testflight/).

## Recovery and retirement

Each manual handler owns an append-only draft-release journal. It retains the
original plan, exact candidate, provider intent and verified per-stage receipts.
These are operational records, not completed release announcements. One unresolved
journal blocks a new allocation across profiles.

Rerun the retained failed worker/handler after resolving its explicit obstacle;
do not dispatch a replacement release to escape an uncertain result. Successful
stages are reverified and reused. Lost responses require a complete provider
inventory and a unique matching operation. An empty inventory after interruption,
multiple matches, changed export bytes or a moved channel blocks another request.
Worker failure may include partial publication and is never proof of absence.

OTA publication has a separate durable intent containing the exact export and
channel digests. The writer has no Expo token; the source-free publisher has no
GitHub content-write permission. The publisher checks delivered manifest and asset
bytes before attesting success. Historical receipts remain usable after temporary
workflow artifacts expire, subject to current protected signer policy. The
historical iOS/selective-OTA policy file is
`.github/ios-release-attestation-trusted-workflow-shas`; explicit revocation wins.

Automatic retirement is restricted to proven terminal, unpublished candidates
with complete all-attempt job evidence and no provider intent. It records a
durable tombstone, retains original assets, closes only the verified unmerged
candidate and reads back cleanup. Retryable, merged, partial, unknown or uncertain
publication states remain recoverable. Interrupted cleanup resumes from the
tombstone and cannot silently discard the original identities.

## Safe validation

`npm run test:release` and `npm run test:native-release` exercise synthetic plans,
worker arguments, byte-bound receipts, CI rejection, interruption, retries and
cleanup. They do not invoke live release workflows or providers. Native device
testing, a real EAS build, macOS IPA inspection against a real provider artifact,
Apple upload/processing and production rollout remain separate unperformed
operator validation. Use the PR's retained evidence for the exact tested revision
and current CI/review state.
