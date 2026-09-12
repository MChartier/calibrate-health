# Release compatibility and artifact provenance

Server release versions, native app versions, and Expo OTA identities are independent.
`shared/release.json` stores server/native metadata and `npm run release:check` verifies its package,
Expo, Gradle, and diagnostic mirrors. Co-location in this file does not imply lockstep releases.
See [client-versioning.md](client-versioning.md) for the versioning model.

## Compatibility policy

Each running Expo bundle declares an explicit `requiresServer` range in `shared/client-release.json`,
for example `>=0.36.0 <1.0.0`. The lower bound is inclusive, including its patch; the upper bound is
exclusive. This requirement is reviewed with client changes and does not change merely because a
server release or native build was cut. Explicit bounds also avoid assuming all 0.x minors are compatible.

| Client requirement | Selected server | Result |
| --- | --- | --- |
| `>=2.4.1 <3.0.0` | `2.4.0` | Blocked; required patch is missing. |
| `>=2.4.1 <3.0.0` | `2.5.0` | Compatible. |
| `>=2.4.1 <3.0.0` | `3.0.0` | Blocked; server is outside the supported range. |

The maintainer deploys required server changes before native/OTA publication. Local commands print
the requirement but do not probe servers or require a deployment confirmation.

The server returns `/api/v1/client-config` with `Cache-Control: no-store`. Before saving a server,
refreshing a saved session, or manually rechecking compatibility, the phone requests it with
Fetch `cache: 'no-store'`. It blocks an unsupported API, a server outside the bundle's range, or an
installed native version below `min_supported_mobile_version`, with actionable guidance.

Native phone and Wear requests also send `X-Calibrate-Client-Platform` and `X-Calibrate-Client-Version`.
The server validates supported API and minimum native versions; cookie-authenticated web sessions
remain unaffected. Self-hosts retain this runtime protection even when their deployment lags.

Expo owns automatic update checks and downloads. Client code checks the running bundle; it does not
inspect candidate manifests or veto downloads. Native compatibility uses an exact `appVersion`
runtime plus a saved native fingerprint, separately from the server requirement.

## Channels

| Expo channel/profile | Artifacts | Delivery |
| --- | --- | --- |
| `internal` | Locally signed phone/Wear release APKs and AABs | Direct device testing; internal OTA. |
| `production` | Locally signed phone/Wear release APKs and AABs | Upload to Play internal tracks; production OTA. |

The local wrapper uses the release Gradle build for both profiles and requires the same Android
signing certificate for phone and Wear. Development debug/internal Gradle variants remain available
separately. Never include signing credentials in release metadata.

Promote the exact uploaded production-profile codes in Play Console. Play tracks and Expo channels
are separate: Play internal testers of that pair receive production OTA. Local JSON records,
artifact hashes, source ancestry, and native fingerprints support retries and OTA compatibility.
See [local-release.md](local-release.md).

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
4. Instance publishing credentials belong on the operator machine. Public Actions require no Expo, Play,
   Android signing, receipt/tag signing, or deployment SSH credentials.

Candidate preparation, validation, and image construction use read-only repository tokens with no registry write
permission. Separate publication jobs receive only the permissions needed for their operation: Contents write for
candidate branches and stable tags, Contents and Pull requests write for finalization/cleanup, and Packages write
for GHCR. The image-receipt signer has only Contents read, OIDC write, and Attestations write and runs the full-SHA-pinned
attestation action before package authentication. Source-owned build commands never run on the package publisher.
The publisher verifies artifacts and current workflow authority with reviewed tooling before logging into GHCR.

These job boundaries limit accidental credential exposure in the reviewed workflow. They are not an external
capability boundary against someone allowed to edit or rerun workflows with write permissions. The App/robot design
was a stronger, optional security migration that required separate onboarding; this flow uses the configured Actions
identity instead. Existing branch protection remains in force. Instance publication uses the local release pipeline.

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
image recovery window, and review removals or explicit revocations as release-key revocations. Pre-hardening
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
After image publication, GitHub's server release workflow is complete. The maintainer upgrades Docker
on the host, then publishes native/OTA changes with [the local commands](local-release.md).
Client publication is independent and does not enforce server rollout order.

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
  shown in the action summary. Recover local deployment/native/OTA stages separately using `docs/local-release.md`.
  Tag creation is idempotent, and a manifest ahead of the latest tag blocks another version bump until this is
  resolved.
- **Build Release Image** remains available for an image-only rebuild. Moving `latest` is allowed only for the highest
  stable tag; use **Publish prepared release** when server tag creation also needs recovery.

The reusable image workflow still prevents rebuilding an older tag from executing historical deployment jobs. The
version and source-SHA image identities are write-once. Only a registry config digest with the exact verified receipt
attestation is authoritative: recovery fills a missing alias only from that attested manifest, fails if immutable
identities disagree, and never adopts an unattested pre-existing digest. A fresh publication also proves the pushed
config digest equals the credential-free build identity. Moving `latest` is created only from that verified immutable
digest. Validated releases publish version, source-SHA, and moving `latest` tags to GHCR. Operators deploy with
[manual Docker upgrades](../deploy/self-hosted/README.md). No GitHub Release object or generated changelog is created.

**Cut release** owns exact-candidate metadata validation plus the production container build and startup smoke.
Affected pull-request and scheduled workflows own the broader test, dependency, vulnerability, and migration gates.
The local `release:check:container` command covers the encrypted backup/restore smoke, dependency policy, canonical
version checks, and the static release-acceptance policy; `release:check:production` adds strict dependency policy.
Physical Android/Wear, store-console, and distributed-upgrade checks remain available when the owner considers them
useful for a native distribution, but do not block publishing an independent server/web image.

Phone and Wear can still evolve independently in code, but a Play store release is prepared and published as one
paired version so the shared signing and Data Layer contract are tested together. Prepare every checked-in mirror,
and the globally unique code pair together:

```powershell
npm.cmd run release:native:prepare -- --bump patch
npm.cmd run release:check
npm.cmd run test:release
```

Merge reviewed native metadata, then use `release:native` from the current clean checkout.
The local command builds the pair, verifies Android signing and exact artifact hashes, and retains
an ordinary JSON record. Production-profile publication uploads to Play internal tracks; subsequent
promotion happens in Play Console. OTA reuses the saved compatible native runtime/channel record.
No signed native tag or extra receipt key is required. See [local-release.md](local-release.md).

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
