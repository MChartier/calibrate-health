# Release compatibility and artifact provenance

`shared/release.json` is the canonical release manifest for the server, the shared Expo mobile compatibility line,
the Android app, and the Wear OS app. Android and iOS Expo clients share its semantic mobile version and minimum-version
policy; Expo config and client-diagnostic allowlists mirror those values. Android build files also mirror the manifest
because Expo and Gradle need native values before application code runs; `npm run release:check` fails quickly when any
mirror drifts.

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

For example, these running-bundle checks follow `shared/releaseCompatibility.ts`:

| Bundled server contract | Selected server | Result |
| --- | --- | --- |
| `0.35.0` | `0.35.2` | Compatible; patch differences do not block use. |
| `0.34.0` | `0.35.0` | Compatible; the server supports the older client minor. |
| `0.35.0` | `0.34.0` | Blocked; update the selected server before using this bundle. |
| `0.35.0` | `1.0.0` | Blocked; the client and server majors must match. |
| `1.0.0` | `0.35.0` | Blocked; the client and server majors must match. |

These are runtime results, not promises about whether Expo downloads or launches an update. During production
approval, compare the candidate bundle's contract with the release owner's intended server rollout. An approval
cannot establish compatibility for independently managed self-hosts, so each device must still perform its own
uncached check before restoring a session or synchronizing. Do not replace that check with private-server polling
from CI or require equal minor versions when the server minor is newer.

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
- Phone and Wear artifacts must keep application ID `net.darkmachines.healthtracker` and use the same signing certificate
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
successful `master` run; a `workflow_run` handler loaded from default `master` revalidates that request before calling
the reusable worker. Use the existing repository configuration:

1. Enable **Allow GitHub Actions to create and approve pull requests** in the repository's Actions settings.
   The default workflow token can remain read-only; each publishing job declares its required permissions.
2. Keep the existing `master` pull-request protection. Release finalization uses GitHub's PR merge API and obeys
   repository rules. Additional required reviews or checks must be satisfied before merging.
3. Give this repository Write access to the `calibratehealth` GHCR package under **Manage Actions access** (or retain
   its inherited repository access). The image publisher authenticates with its ephemeral `GITHUB_TOKEN` and
   `packages: write`. A dedicated Server Release GitHub App, GHCR robot, custom publication environment, and extra
   server tag rulesets are not prerequisites.
4. Retain the configured `EXPO_TOKEN` repository secret and the `preview` and reviewer-protected `production`
   environments for OTA. A server/image release can complete when its native baseline is unavailable; OTA is skipped.

Candidate preparation, validation, and image construction use read-only repository tokens with no registry write
permission. Separate publication jobs receive only the permissions needed for their operation: Contents write for
candidate branches and stable tags, Contents and Pull requests write for finalization/cleanup, and Packages write
for GHCR. The image-receipt signer has only Contents read, OIDC write, and Attestations write and runs the full-SHA-pinned
attestation action before package authentication. Source-owned build commands never run on the package publisher.
The publisher verifies artifacts and current workflow authority with reviewed tooling before logging into GHCR.

These job boundaries limit accidental credential exposure in the reviewed workflow. They are not an external
capability boundary against someone allowed to edit or rerun workflows with write permissions. The App/robot design
was a stronger, optional security migration that required separate onboarding; this flow uses the configured Actions
identity instead. Existing branch protection and the production approval remain in force.

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

GitHub certificates distinguish the reusable signer (`container.yml`) from the top-level build configuration
(`cut-release-handler.yml`, `publish-release-handler.yml`, or `container-handler.yml`). Both must name this repository
at the same exact protected-master revision, and the caller must use `workflow_run`. Treating the two workflow paths
as identical rejects valid receipts and prevents recovery after the initial image push.

The GitHub attestation store is an integrity authority, not an availability boundary. The verifier uses an explicit
bounded high lookup limit so unrelated attestations cannot exhaust the default result window, then re-verifies the
authorized certificate with its exact signer and source digest. An actor or workflow with `attestations: write` may
still flood or delete records. Missing, deleted, or invalid legitimate receipt evidence therefore fails closed before
alias fill or `latest` mutation; quarantine/delete the blocked immutable aliases after an owner audit and perform a
fresh build/attestation/publication rather than trusting the registry bytes.

Server candidate publication, validated PR merge, tag creation, and GHCR publication run automatically. No new server
publication environment approvals are required. If validation or finalization fails before merging, read-only
inspection first proves the candidate PR/branch still belong to the action; cleanup closes and deletes only that exact
unmerged candidate. **Publish prepared release** and **Build Release Image** also run without a server environment gate.

The action requires the checked manifest version to equal the highest stable tag, prepares every server/web mirror on
`release/vMAJOR.MINOR.PATCH`, and validates that exact commit. It verifies the candidate parent and identity,
synchronized release configuration, and exact eight-file mirror set. It also builds and starts the production image,
then checks readiness and the served web application. Unit and integration tests, generated API and deploy contracts,
dependency checks, vulnerability scanning, and database upgrade/rollback rehearsal remain targeted pull-request or
scheduled checks and are not replayed for the version-only candidate. If `master` advances while validation runs, the
candidate is not merged; rerun the action so the later change is part of a newly validated candidate.

After validation, the action creates a version-only release PR and verifies the parents and tree of GitHub's proposed
merge. It rechecks `master` immediately before calling the PR merge API with the exact validated head SHA. The API
honors branch protection and locks the head, but does not offer a base-SHA compare-and-swap. The workflow therefore
checks the actual merged parents, tree, and current `master` again before allowing tag/image publication. A concurrent
base change in that small window stops publication even if GitHub already merged the PR; inspect the failed run before
starting recovery. No direct push or ruleset bypass is used to merge `master`.
**Publish prepared release** verifies that the exact candidate is now an ancestor of `master`, creates or verifies its
annotated tag, and calls the reusable GHCR image workflow with `publish_latest: true`. It is called directly rather
than relying on
token-generated push or PR events, whose workflow behavior is restricted by
[GitHub's `GITHUB_TOKEN` rules](https://docs.github.com/en/actions/concepts/security/github_token).
After image publication, the workflow publishes the exact release commit to Expo only when the native-build tag from
`shared/release.json` is a cryptographically verified release attestation and its app version and native fingerprint
match the prepared source. Internal environment resolution and publication use `preview`. After internal publication,
one approval in the existing `production` environment gates production environment resolution, export, and publication.
The four credential stages remain separate from source export. The repository `EXPO_TOKEN` is project-wide, so this
approval controls workflow sequencing rather than providing a channel-scoped credential boundary. A missing, unattested, or
incompatible native tag skips OTA without failing the independent server/image release. Rerun **Publish prepared
release** only when that immutable prepared manifest already records the compatible protected tag; otherwise use the
manual OTA workflow with an exact source that descends from the installed native baseline. Neither OTA path waits for
or triggers self-host deployment.

An opted-in deployment job updates the configured self-host alongside OTA using the receipt-verified immutable image
digest. It also runs when the native baseline is unavailable and OTA is skipped. OTA does not wait for deployment.

Expo's automatic check and download lifecycle remains unchanged. Compatibility is evaluated only after a bundle is
running: native startup uses the Fetch `cache: 'no-store'` request described above to compare its bundled expected
server contract version before restoring the saved session or synchronizing. An incompatible update can therefore
download and start before the runtime gate blocks normal authenticated use. Protected production approval is the
current public-channel promotion control. A future automated gate may require an explicit deployment-readiness signal
for the release owner's declared server rollout, but independent self-hosts still require the runtime guard. The
optional deployment job verifies only its configured target; CI must not poll independent private servers to gate OTA.

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
digest. Validated releases publish version, source-SHA, and moving `latest` tags to GHCR. Operators can opt one existing
Compose stack into [deployment over WireGuard](../deploy/self-hosted/README.md), or keep deploying manually.
**Deploy self-hosted server** retries a published digest without rebuilding or republishing OTA. No GitHub Release
object or generated changelog is created.

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
