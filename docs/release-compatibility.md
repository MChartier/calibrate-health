# Release compatibility and artifact provenance

`shared/release.json` is the canonical release manifest for the server, Android phone app, and Wear OS app. The
backend and phone connection preflight consume its API and minimum-version policy directly. Android build files must
mirror the manifest because Expo and Gradle need native values before application code runs; `npm run release:check`
fails quickly when any mirror drifts.

## Compatibility policy

Calibrate uses semantic `version_name` values for compatibility decisions and positive, monotonically increasing
Android `version_code` values for upgrades. A self-hosted server should support every API listed in
`server.api.supported`. It may raise a minimum client version only when older releases cannot operate safely or
correctly; routine feature additions should remain backward compatible.

The Android native version remains independent from the server/web version. Each JavaScript bundle separately carries
the `shared/release.json` server version whose contract it expects. Bundle and server major versions must match.
Within a major, an older client minor remains compatible with a newer server minor because the server remains backward
compatible. A newer client minor is incompatible with an older server minor because required additions may be
missing. Patch drift remains compatible. This directional boundary protects a self-host whose deployment can lag OTA
publication, even when the v1 wire changes are additive.

The server returns `/api/v1/client-config` with `Cache-Control: no-store`. Before saving a server, refreshing a saved
session, or manually rechecking compatibility, the phone also requests it with Fetch `cache: 'no-store'`. It refuses
an unsupported API, an incompatible server contract version, or a native release older than
`min_supported_mobile_version` with actionable guidance. Native phone and Wear HTTP
requests also send `X-Calibrate-Client-Platform` plus `X-Calibrate-Client-Version`. The server compares the trusted
bearer-session platform with those headers on every authenticated request and requires Wear identity during the
one-time pairing exchange. Browser cookie sessions omit these headers and are unaffected.

Expo retains its normal update lifecycle; the client does not veto an update download based on the selected server.
If an incompatible bundle starts, the runtime preflight blocks normal authenticated use before session refresh and
synchronization. Longer term, production/public channel promotion should require an explicit deployment-readiness
signal that the declared server rollout is compatible with the candidate bundle. Internal publication remains
available for validation, and CI does not poll private self-hosted servers. That signal can attest readiness only for
the release owner's declared server rollout; independently managed self-hosts still rely on the runtime mismatch
guard.

An incompatible native request receives HTTP 426 with `CLIENT_UPGRADE_REQUIRED`, the applicable minimum version, and
a non-retryable user message. Phone keeps its credentials and offline outbox behind an update-required screen. Wear
keeps pairing, cache, and queued mutations but stops normal refresh/action work behind a dedicated update-required
state. Foregrounding that Wear screen schedules a bounded compatibility probe; a committed compatible snapshot clears
only the upgrade marker and then resumes retained queued work. This allows either an in-place watch update or a server
rollback that lowers the client floor to recover without re-pairing or discarding local data. A platform header cannot
override the device platform retained by the authenticated server session.

Compatibility changes follow these rules:

- Additive API and database changes remain compatible with the current API version.
- A breaking wire change requires a new API version while the old version remains in `supported` during migration.
- Raising a minimum client version is a last-resort safety boundary and must be called out in release notes.
- Phone and Wear artifacts must keep application ID `app.calibratehealth.mobile` and use the same signing certificate
  for Wear Data Layer communication.
- Phone and watch versions may advance independently, but each artifact's `version_code` must exceed its previously
  distributed build.

## Channels

| Channel | Phone artifact | Wear build type | Intended use |
| --- | --- | --- | --- |
| `debug` | Local Expo/Gradle debug | `debug` | Emulator and development devices only |
| `internal` | Locally signed release APK | `internal` | Owned-device validation before store release |
| `production` | Locally signed release AAB | `release` | Store-distributed release |

The internal Wear build uses shared release signing when all `CALIBRATE_ANDROID_SIGNING_*` values are supplied and
falls back to the repository debug key for local phone-debug pairing. `npm run build:native:release` supplies the same
validated signing environment to the phone and Wear release builds. Any future EAS-built phone artifact can pair only
with a Wear artifact signed by that same certificate. Never place signing material in `shared/release.json` or
generated metadata.

Store delivery uses one paired production-channel build. **Native Android Store Release** uploads its phone AAB to
Play track `qa` and Wear AAB to `wear:qa` in one edit. Separate operations promote those exact version codes first
to the custom `closed` and `wear:closed` tracks, then to `production` and `wear:production`, without rebuilding.
Because both artifacts
share one Play application, the repository reserves globally unique odd phone and even Wear version codes.
Before Play authentication, a source-free job attests deterministic receipt bytes binding the repository, app,
source/tag/version, and exact role/track/code/AAB hashes. The publisher reconstructs and verifies those bytes; recovery
reconstructs them only from exact Play observations, scrubs Play authentication, and verifies the original
GitHub-hosted `.github/workflows/native-release.yml@refs/heads/master` certificate before tag signing. Current-master
`allow`/`revoke` policy governs historical signer revisions, with revocation authoritative. Missing or legacy evidence
cannot be adopted and requires a fresh higher version-code pair.

## Explicit server/web releases

Ordinary feature and fix PRs must not change `server.version` or its package, diagnostic, OpenAPI, generated-client,
or lockfile mirrors. Merge the desired changes to `master`, then run **Cut release** from the GitHub Actions page and
choose the semantic component to advance:

- `patch` for compatible fixes: `X.Y.Z` to `X.Y.(Z+1)`.
- `minor` for compatible features: `X.Y.Z` to `X.(Y+1).0`.
- `major` for breaking server, API, or deployment contracts: `X.Y.Z` to `(X+1).0.0`.

The three manual Actions entries are read-only request workflows. They upload a small request bound to the exact
successful `master` run; a `workflow_run` handler whose implementation GitHub loads from protected default `master`
revalidates that request before calling the reusable worker. Branch-selected workflow code therefore receives no
server-release credential. This code path is intentionally unavailable until all external controls below exist:

1. Create the `server-release-publication` GitHub environment. Allow only the selected deployment branch `master`,
   require a release-owner review, prevent self-review, and disable administrator bypass. Verify this policy before
   storing any release variable or secret.
2. Install a dedicated Server Release GitHub App only on this repository. Grant only Metadata read, Contents write,
   and Pull requests write; do not grant Packages, Actions, Workflows, Administration, or unrelated permissions.
   Configure active rulesets for `master` and `release/v*`; make the Server Release App their only automation bypass
   actor and deny the built-in GitHub Actions App. Configure two separate active tag rulesets targeting exactly
   `refs/tags/v*`: `server-release-tag-creation` restricts creation and grants bypass only to the Server Release App,
   while `server-release-tag-immutability` restricts updates and deletions with an empty bypass list. The App never
   needs to move or delete a stable tag. Verify both exact scopes, rule sets, and bypass lists before storing the App
   credential; the read-only workflow gate can verify visible rules but GitHub does not expose bypass actors there.
3. Use a separate robot identity for GHCR with no repository collaborator role. Give it explicit Write access only to
   the `calibratehealth` package and create a classic PAT with `write:packages` only and no `repo` scope. In the
   package's granular settings, detach inherited repository permissions and remove this source repository's Actions
   write access under **Manage Actions access**. `GITHUB_TOKEN` must be unable to push or replace package tags.
4. Before enabling the package robot, inventory every existing `v*` and `sha-*` alias in the `calibratehealth`
   package, including the current `v0.35.0` identities when present. Existing aliases predate the protected receipt
   signer and are not trusted merely because their digests, labels, or two aliases agree. After an owner review,
   quarantine them outside the release alias namespace or delete them, then use this workflow for a fresh attested
   publication. Do not let the new publisher adopt, fill from, or move `latest` from an unattested legacy digest.
5. Only after steps 1-4 are verified, store `SERVER_RELEASE_APP_ID` and `GHCR_PUBLISH_USERNAME` as environment
   variables and `SERVER_RELEASE_APP_PRIVATE_KEY` and `GHCR_PUBLISH_TOKEN` as environment secrets. Do not duplicate
   any of those names as repository or organization secrets or variables.
6. Apply the rulesets and remove the old Actions/package authority before enabling or rerunning publication. Historical
   workflow runs retain their original workflow source on rerun; external App/ruleset/package controls are what make
   those old runs powerless. Until this onboarding is complete, missing protected-environment configuration makes the
   new workers fail closed and the release stack must be treated as not yet operational.

Candidate preparation and image construction run on uncredentialed runners. Fresh environment-bound jobs mint the
App token only after exact candidate verification, or receive the package-only token only after the image artifact and
Git tag are reverified. Candidate/source build code is never executed with the GHCR credential; the publisher executes
only reviewed immutable verifier tooling against its isolated release checkout after authentication. Ordinary
`GITHUB_TOKEN`s remain read-only throughout this server-release call graph. The narrow exception is the isolated,
source-free image-receipt signer: its callers propagate `id-token: write` and `attestations: write`, and its concrete
job uses those GitHub-native capabilities only with the full-SHA-pinned `actions/attest` action. It has no environment,
package token, App key, source checkout, or package-write permission; every other concrete server-release job remains
read-only unless it performs its separately protected App/PAT operation.

Before package authentication, the build's deterministic receipt binds the GitHub repository, GHCR repository,
release tag, release commit, and Docker image config digest. The isolated signer attests those exact bytes before any
registry mutation. Recovery reconstructs the same receipt from the config digest of the exact observed single
linux/amd64 registry manifest and verifies it with a checksum-pinned GitHub CLI against the exact repository, signer
workflow path, signer revision, source revision, and `refs/heads/master`. The freshness-verified workflow revision is
trusted automatically. A receipt from an earlier protected-master revision remains usable across unrelated commits only
when every security-critical image workflow/verifier blob is byte-identical, or when it is the exact post-hardening
parent of the verified canonical Cut release commit. Current protected `master` can retain a changed historical signer
with `allow FULL_SHA`, or override every automatic rule with `revoke FULL_SHA`, in
`.github/release-image-attestation-trusted-workflow-shas`. Keep required changed signers allowed for the full supported
image/OTA recovery window, and review removals or explicit revocations as release-key revocations. Pre-hardening
revisions, off-master revisions, changed unlisted revisions, and explicitly revoked revisions fail closed.

The GitHub attestation store is an integrity authority, not an availability boundary. The verifier uses an explicit
bounded high lookup limit so unrelated attestations cannot exhaust the default result window, then re-verifies the
authorized certificate with its exact signer and source digest. An actor or workflow with `attestations: write` may
still flood or delete records. Missing, deleted, or invalid legitimate receipt evidence therefore fails closed before
alias fill or `latest` mutation; quarantine/delete the blocked immutable aliases after an owner audit and perform a
fresh build/attestation/publication rather than trusting the registry bytes.

GitHub approves `server-release-publication` separately for every job that references it. A normal **Cut release**
therefore has four sequential server-release approvals:

1. publish the exact candidate branch and create its pull request;
2. merge the validated pull request to `master`;
3. create the immutable stable `vMAJOR.MINOR.PATCH` tag; and
4. publish the verified image identities to GHCR.

If validation fails before `finalize` starts, the run needs candidate publication plus conditional cleanup: two
approvals. If `finalize` was approved and then fails before merging, cleanup is a third approval after candidate and
finalize. Cleanup becomes eligible only after a read-only inspection proves the pull request/branch still belong to
the action and the candidate ref is unchanged; it closes and deletes only that exact unmerged candidate. **Publish
prepared release** recovery requires two approvals (stable tag, then image), while **Build Release Image** requires
one image approval. The first three normal Cut checkpoints and conditional cleanup expose the same narrow Server
Release App authority to fixed, operation-specific jobs; they sequence that authority rather than creating
independent credentials. The image checkpoint admits the separate package-only robot and never receives the App
private key.

The action requires the checked manifest version to equal the highest stable tag, prepares every server/web mirror on
`release/vMAJOR.MINOR.PATCH`, and validates that exact commit. It verifies the candidate parent and identity,
synchronized release configuration, and exact eight-file mirror set. It also builds and starts the production image,
then checks readiness and the served web application. Unit and integration tests, generated API and deploy contracts,
dependency checks, vulnerability scanning, and database upgrade/rollback rehearsal remain targeted pull-request or
scheduled checks and are not replayed for the version-only candidate. If `master` advances while validation runs, the
candidate is not merged; rerun the action so the later change is part of a newly validated candidate.

After validation, the protected Server Release App creates a version-only release PR, fetches the exact merge commit GitHub generated for
that PR, and verifies its base parent, candidate parent, and tree. It pushes that commit to `master` without force, so
GitHub atomically rejects the merge if `master` changed after the final drift check while retaining the PR audit trail.
**Publish prepared release** verifies that the exact candidate is now an ancestor of `master`, creates or verifies its
annotated tag, and calls the reusable GHCR image workflow with `publish_latest: true`. It is called directly rather
than relying on
token-generated push or PR events, whose workflow behavior is restricted by
[GitHub's `GITHUB_TOKEN` rules](https://docs.github.com/en/actions/concepts/security/github_token).
After image publication, the workflow publishes the exact release commit to Expo only when the native-build tag from
`shared/release.json` is a cryptographically verified release attestation and its app version and native fingerprint
match the prepared source. Each of the two environment-resolution jobs and two source-free publisher jobs requires a
separate `expo-publication` approval. Expo's project-wide token is not channel scoped, so the production-stage
approvals enforce reviewed workflow sequencing rather than a distinct production credential boundary. A missing, unattested, or
incompatible native tag skips OTA without failing the independent server/image release. Rerun **Publish prepared
release** only when that immutable prepared manifest already records the compatible protected tag; otherwise use the
manual OTA workflow with an exact source that descends from the installed native baseline. Neither path waits for or
triggers self-host deployment.

Expo's automatic check and download lifecycle remains unchanged. Compatibility is evaluated only after a bundle is
running: native startup uses the Fetch `cache: 'no-store'` request described above to compare its bundled expected
server contract version before restoring the saved session or synchronizing. An incompatible update can therefore
download and start before the runtime gate blocks normal authenticated use. Protected production approval is the
current public-channel promotion control. A future automated gate may require an explicit deployment-readiness signal
for the release owner's declared server rollout, but independent self-hosts still require the runtime guard. CI must
not poll private servers.

The preparation command is also available for isolated release tooling tests:

```powershell
npm.cmd run release:prepare -- --bump patch
```

It updates `shared/release.json`, root/backend package manifests and lockfiles, the two-version web diagnostics
window, the OpenAPI enum, and its generated TypeScript union as one validated batch. Do not run it in an ordinary
feature worktree and commit the result manually.

Recovery is deliberately state-specific:

- Before merge, failed validation or `master` drift deletes only the unchanged action-owned candidate branch. Fix the
  failure on `master` and rerun **Cut release**.
- If a post-merge tag or image stage failed, rerun **Publish prepared release** with the release commit and branch
  shown in the action summary. Its OTA stage is also replayable when that prepared manifest already records a
  compatible protected native tag. A historical release whose recorded native baseline is incompatible requires the explicit
  exact-source manual OTA path in `docs/mobile-release.md`; do not relax source ancestry or fingerprint checks.
  Tag creation is idempotent, and a manifest ahead of the latest tag blocks another version bump until this is
  resolved.
- **Build Release Image** remains available for an image-only rebuild. Moving `latest` is allowed only for the highest
  stable tag; use **Publish prepared release** when the ordered image and OTA stages must also resume.

The reusable image workflow still prevents rebuilding an older tag from executing historical deployment jobs. The
version and source-SHA image identities are write-once. Only a registry config digest with the exact verified receipt
attestation is authoritative: recovery fills a missing alias only from that attested manifest, fails if immutable
identities disagree, and never adopts an unattested pre-existing digest. A fresh publication also proves the pushed
config digest equals the credential-free build identity. Moving `latest` is created only from that verified immutable
digest. Validated releases publish version, source-SHA, and moving `latest` tags to GHCR; deployment to a self-host remains an
operator-controlled Docker Compose operation. No GitHub Release object or generated changelog is created.

**Cut release** owns exact-candidate metadata validation plus the production container build and startup smoke.
Affected pull-request and scheduled workflows own the broader test, dependency, vulnerability, and migration gates.
The local `release:check:container` command covers the encrypted backup/restore smoke, dependency policy, canonical
version checks, and the static release-acceptance policy; `release:check:production` adds strict dependency policy.
Physical Android/Wear, store-console, and distributed-upgrade checks remain available when the owner considers them
useful for a native distribution, but do not block publishing an independent server/web image.

Phone and Wear can still evolve independently in code, but a Play store release is prepared and published as one
paired version so the shared signing and Data Layer contract are tested together. Prepare every checked-in mirror,
the globally unique code pair, and the native source tag atomically:

```powershell
npm.cmd run release:native:prepare -- --bump patch
npm.cmd run release:check
npm.cmd run test:release
```

Merge the reviewed native metadata with the implementation, then dispatch **Native Android Store Release** with the
exact full merge commit. Expo prebuild continues to generate ignored native files. Play/GitHub account setup and
signing secrets are described in `docs/mobile-release.md`. Native preparation verifies the current manifest tag
against the exact published `origin` tag and `origin/master` history; an unfetched remote tag is fetched exactly, while
a local-only tag is rejected. The authoritative evidence is a signed annotated tag whose tag-object signature verifies
with reviewed verifier code pinned to the workflow SHA, against
`.github/native-release-tag-allowed-signers` freshly checked out from the exact current protected `master` commit,
and whose internal name and peeled/direct target SHA exactly match the requested tag and source commit. Each run logs
the trust-set commit so an old workflow rerun cannot revive a revoked key. The same verification gates native
upload/recovery, closed and production promotion, prepared-release OTA readiness, and native preparation. A commit
signature, lightweight tag, unsigned or malformed object, untrusted key, or wrong target is not sufficient.

The independently attested Play receipt is an additional pre-tag boundary, not a substitute for the signed tag. A
Play release name remains only a state consistency check: changing it cannot transfer another source's receipt because
the source commit and both exact AAB hashes are in the canonical subject. Recovery is available only while the exact
attestation remains discoverable within the bounded 100-result lookup and its signer remains on protected-master
history, post-hardening, and unrevoked. Full critical-tooling drift requires an explicit reviewed `allow SHA`; remove
that temporary retention after its historical recovery window. Pre-attestation Play pairs require a new higher
odd/even pair and upload.

Repository creation/update/deletion rulesets for `refs/tags/native-v*` remain defense-in-depth. The read-only GitHub
Rulesets API hides bypass actors, so observing the expected rules cannot prove which identities may bypass them and
cannot replace the signed-tag check. Key isolation, onboarding, overlapping-key rotation, old-key retirement, and
emergency revocation procedures are defined in `docs/mobile-release.md`; the comment-only allowed-signers placeholder
trusts nobody and therefore fails every release-attestation check closed.

## Reproducible artifact metadata

Generate metadata from the exact release commit. Set `SOURCE_DATE_EPOCH` to the commit timestamp so repeated runs over
the same commit and artifacts produce the same timestamp. Write the result outside the repository so creating the
file does not itself make the recorded worktree dirty.

```powershell
$env:SOURCE_DATE_EPOCH = git show -s --format=%ct HEAD
npm.cmd run release:metadata -- --channel internal `
  --artifact phone=mobile\calibrate-internal.apk `
  --artifact wear=wear\app\build\outputs\apk\internal\app-internal.apk `
  > ..\calibrate-internal-release.json
```

The JSON records the channel, Git commit and dirty state, canonical server/client versions, application ID, artifact
file names, byte counts, and SHA-256 digests. Keep it with the artifacts and release notes; it intentionally contains
no credentials, machine-specific absolute paths, or wall-clock timestamp.

## Native distribution review

Use the applicable items below when distributing phone or Wear artifacts. This is an owner review checklist, not a
standing server/web CI or release gate.

- [ ] `npm run release:check` and `npm run test:release` pass on the release commit.
- [ ] The worktree is clean and the metadata reports the expected Git commit.
- [ ] Every distributed Android artifact has a higher `version_code` than its predecessor.
- [ ] Phone and Wear application IDs and signing certificate fingerprints match.
- [ ] Server API support and mobile/Wear minimum versions match the intended rollout order.
- [ ] Upgrade tests preserve login, local database state, queued mutations, and watch pairing.
- [ ] Phone and Wear smoke tests cover food, weight, activity, disconnect/reconnect, and offline recovery.
- [ ] Artifact SHA-256 values match the generated metadata after transfer.
- [ ] Release notes identify any raised minimum version, migration requirement, or known rollback constraint.
