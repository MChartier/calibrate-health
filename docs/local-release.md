# Local native and OTA releases

Use three commands from the current clean checkout. Server release versions, native app versions,
and OTA identities are independent; see [client-versioning.md](client-versioning.md).

~~~text
npm run release:native:prepare -- --bump patch
npm run release:native -- --profile internal
npm run release:ota -- --channel internal
~~~

Each command supports --dry-run. It validates and reports the selected operation without building,
uploading, publishing, or changing version files. Native preparation still refreshes origin/master
to detect stale build numbers. Native dry-run requires the selected profile's local configuration
and credential files. OTA dry-run needs a matching saved build record but no Expo token.

## Release order

1. When server/image changes need releasing, manually run **Cut release** and choose patch, minor,
   or major. GitHub creates the version/tag and publishes the image.
2. Upgrade Docker on the server yourself, following [the deployment guide](../deploy/README.md).
3. Publish clients when their declared server requirement is satisfied.

Local client commands print requiresServer from shared/client-release.json. They never connect to
your instance to approve publication or deploy it. The application's existing runtime guard checks
the running bundle against the selected server. There is no combined deploy-and-OTA command.

Instance publishing and deployment Actions are retired. After configuring local publishing,
remove unused personal Expo/Play/deployment credentials from GitHub.
Server tag/image publication stays in GitHub Actions.

## Local setup

Install Node 24, Git, and dependencies with npm ci before loading credentials. OTA also needs the
locked EAS CLI: npm ci --prefix tools/eas-cli --include=dev --no-audit --fund=false.

Native builds run the existing phone/Wear Gradle workflow locally on Windows or Linux. Install
Java 17, Android SDK/build tools, and verified bundletool using [mobile-release.md](mobile-release.md).
Set JAVA_HOME, ANDROID_HOME, and BUNDLETOOL_JAR. There is no Expo cloud build usage. iOS native
publication is outside these Android commands.

Store configuration in environment variables or a gitignored .release.env. The npm aliases inherit
the shell environment; to load that file explicitly:

~~~text
node --env-file=.release.env --experimental-strip-types scripts/local-release.mjs native --profile internal --dry-run
node --env-file=.release.env --experimental-strip-types scripts/local-release.mjs ota --channel production
~~~

| Variable | Use |
| --- | --- |
| EXPO_PUBLIC_CALIBRATE_SERVER_URL | Exact HTTPS origin embedded in native/OTA builds |
| EXPO_PUBLIC_EAS_PROJECT_ID | Expo project UUID embedded in native/OTA builds |
| EXPO_TOKEN | OTA publication only |
| CALIBRATE_ANDROID_SIGNING_STORE_FILE | Native upload keystore path |
| CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD | Native keystore password |
| CALIBRATE_ANDROID_SIGNING_KEY_ALIAS | Native signing alias |
| CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD | Native signing-key password |
| CALIBRATE_ANDROID_SIGNER_SHA256 | Expected upload certificate SHA-256 |
| CALIBRATE_PLAY_SERVICE_ACCOUNT_FILE | Play service-account JSON path; production uploads only |
| CALIBRATE_RELEASE_STATE_DIR | Optional persistent state directory; defaults to .local-release |

The internal profile/channel uses the Expo preview environment; production uses production.
Configure EXPO_PUBLIC_EAS_PROJECT_ID, EXPO_PUBLIC_CALIBRATE_SERVER_URL, and EXPO_UPDATES_CHANNEL
in each EAS environment to match. The launcher checks them before exporting. Source export receives
only public build values; the token is admitted to the separate EAS environment/publishing steps.
Raw downloaded environment files are deleted. No receipt-signing key, GitHub CLI, deployment SSH
credential, or native signer onboarding is required for these local commands.

## Native releases

release:native:prepare increments the paired native app version and allocates the next globally
unique odd phone / even Wear code pair. It updates all existing native mirrors and leaves the
server version and client server requirement unchanged. Commit and merge the generated changes
before publishing. It does not require the previous native tag to be signed or published.

release:native --profile internal builds signed phone/Wear APKs and AABs for direct device testing.
It does not upload them. Install the saved APKs with npm run release:native:devices -- --skip-build.
release:native --profile production builds the production-channel pair and uploads the AABs to
Play internal tracks. Add --build-only to stop after creating/verifying artifacts.

The production profile describes the installed Expo channel, not the Play promotion stage. Test
the uploaded pair and promote those same version codes through closed testing and production in
Play Console. Store declarations/review remain manual. A production-channel binary on a Play
internal track receives production OTA; install the internal-channel profile to test internal OTA.

Android application ID, signing identity, versions, artifact hashes, and source provenance are
verified before upload. The local build record is ordinary JSON, trusted as operator-owned state.
No additional signature or tag trust chain is used. Existing native tag names in release metadata
remain historical labels; these commands do not create or publish tags.

## OTA releases

release:ota --channel internal or production uses that runtime/channel's saved native build record,
checks source ancestry, runtime version, and native fingerprint, exports Android JavaScript/assets,
and publishes through Expo. Build and install the selected native profile before its first OTA.

A changed native fingerprint requires a new native version. JavaScript-only and requiresServer
changes can use the existing runtime. Expo delivers an update to installed builds on the selected
channel with exactly matching runtime/platform. There is no per-native-tag target matrix.

OTA does not increment native versions/codes or cut a server release. The saved result includes
Expo update/group IDs, source commit, runtime label, target channel, and requiresServer.

## State and retries

Keep .local-release (or the configured directory) and the native artifacts. Use one state directory
per app instance. A local lock prevents concurrent operations using that directory.

- Native retries verify the recorded artifacts rather than rebuilding an uploaded code pair.
  Different source or changed artifacts require restoring the original artifacts or preparing
  a new native version. Preserve outputs when switching checkouts/profiles; Gradle output paths
  themselves are shared within one checkout.
- Play refuses conflicting/reused codes; the existing upload helper verifies exact AAB hashes
  when recovering an already-completed pair. Do not rebuild to retry an uncertain upload.
- Completed OTA publications are skipped for the same source/channel. An uncertain upload leaves
  publishing.json and stops automatic retries. Inspect Expo first; removing that marker explicitly
  permits another publication and may create a duplicate update group.
- After a crash, verify no process remains before removing release.lock.

Lost state does not prove an old artifact was published. Retain release records or issue a fresh
higher native version. Runtime compatibility records do not protect against malicious edits by
someone controlling the operator account.

npm run test:release:local covers allocation, artifact reuse, publication retries, native/runtime
compatibility, and explicit server ranges using fixtures. It does not deploy or publish anything.
