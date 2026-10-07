# Release and deploy

Start here for server/web releases, Android phone + Wear packages, and Expo OTA updates.
Publication is manual. Merging a feature PR does not publish an image, upload to Play, or publish OTA.
Run local commands from the repository root; use `npm.cmd` instead of `npm` in Windows PowerShell.

| What changed / what you need | Run | What it does |
| --- | --- | --- |
| Server, API, or web/PWA | GitHub Actions **Release server**, `patch`, `minor`, or `major` | Prepares a version-only PR, waits for its required CI and any workflow approval, merges and tags it, publishes the combined server/web image, then attempts compatible OTA and any opted-in self-host deployment |
| Android native modules/configuration or Wear code; local internal testing | `npm run native:release` | Builds, signs, verifies, and submits phone + Wear to Play internal tracks |
| Phone JavaScript/assets only; local internal testing | `npm run ota:publish -- --message "Describe the tested update"` | Publishes a compatible Expo update for the installed native baseline |
| Public Play store release or promotion | **Native Android Store Release** | Uses the protected [store workflow](native-store-release.md), not the local internal profile |
| Run an already published image | [Compose self-hosting](../deploy/README.md) | Installs/upgrades the server on your host; image publication alone does not deploy it |

## Server and web/PWA

1. Merge the intended changes to `master`. Do not bump server versions in feature PRs.
2. Open [Release server](https://github.com/MChartier/calibrate-health/actions/workflows/cut-release-request.yml),
   choose branch `master`, and select `patch` for compatible fixes, `minor` for compatible features, or `major`
   for breaking contracts. Leave the recovery fields empty and `publish_latest` unchecked.
3. Follow **Handle server release request**, the follow-on run. The first run only records your request;
   the handler owns validation and publication. It waits for the exact candidate PR checks to pass, including any
   required human workflow approval, before merging. Existing branch protection still applies.
4. Confirm image publication completed. The image contains both web/PWA and backend, published as
   `ghcr.io/mchartier/calibratehealth:vX.Y.Z`, `sha-<source-commit>`, and `latest`.

The same run attempts phone OTA only when the manifest records a signed, compatible published native baseline.
It publishes internal first, then waits for the protected `production` approval. Check that the intended server
rollout supports the bundle before approving production. A missing/incompatible native baseline skips OTA;
it does not fail the server release. The [compatibility policy](release-compatibility.md) explains this boundary.

An existing self-host is redeployed only when explicitly enabled through the
[WireGuard deployment setup](../deploy/self-hosted/README.md). This job and OTA run independently after the image
is published. Otherwise, upgrade your host manually with the published tag/digest using the Compose guide.
Keep a recent database backup; migrations are forward-only.

### Recovery, without a new version

Use **Release server** on `master` again. Copy the exact full release commit and `vX.Y.Z` tag from the original
run summary into `release_commit` and `release_tag`; the release branch is derived automatically.

| Operation | Use it for | Side effects |
| --- | --- | --- |
| `resume` | A prepared release merged, but tag/image publication or compatible OTA failed | Verifies/creates the tag, recovers image aliases and `latest`, and retries compatible OTA and opted-in deployment |
| `image-only` | Recover the image for an existing stable tag, including an older release | Recovers only the image; no version bump, OTA, or deployment. `publish_latest` defaults to false and is allowed only for the current highest stable tag |

Before merge, a validated candidate blocked by CI or workflow approval is retained. Approve the exact PR runs
when prompted or repair their failure, then rerun only failed release jobs while `master` and the candidate remain
unchanged. Do not start another bump or use `resume` for that unmerged candidate. If either ref changes, stop and
explicitly reconcile the retained candidate before a fresh request; do not rebase, overwrite, or manually merge it.
A candidate that fails metadata/image validation is eligible for exact-ref cleanup; inspect that outcome before
starting a new request. `resume` is for the current stable release, not moving `latest` backward. Immutable aliases and receipts are verified in both recovery modes; conflicting or
unattested existing images fail closed.

If only host deployment needs retrying, use **Deploy self-hosted server** with the published immutable digest.
If only OTA needs publishing, or a historical prepared manifest records an incompatible native baseline, use
**Publish Expo OTA Update** with an exact compatible source and signed native tag as described in the
[protected OTA guide](native-store-release.md#publish-ota-updates-from-github-actions). These operations do not rebuild server images.

## Local Android phone + Wear

The local profile uses `net.darkmachines.healthtracker`, `https://calibratehealth.darkmachines.net`, Expo channel
`internal`, and Play tracks `qa` / `wear:qa`. Devices need WireGuard access. It does not promote to production.

One-time machine and account setup:

```sh
npm run native:configure
npm run native:setup
```

`native:configure` downloads the linked project's signing key and assigned Play key outside the checkout.
Follow [Play onboarding](android-internal-testing.md) first; the first Play upload may require Console setup.

For a clean, committed candidate with unused native version codes:

```sh
npm run native:release
```

This includes prebuild, signing, all four APK/AAB builds, verification, paired internal-track upload, and readback.
Coordinate other Play Console/API writers before running it: the Play commit can include pending changes for the
same application. It does not allocate versions or commit source. For a new pair, use the
[native version helper](mobile-release.md#native-version-metadata), review and commit the result first.

For device testing or manual upload, use `npm run native:build`, then optionally `npm run native:install`.
Submit those already tested artifacts, or retry a failed submission, with `npm run native:release -- --skip-build`.
It re-verifies retained artifacts and never rebuilds. See [local native details](mobile-release.md) for credentials,
artifact paths, device/signing behavior, and options.

## Local Expo OTA

Use OTA only for phone JavaScript/assets compatible with the build installed on your devices. Native modules,
permissions/configuration, and Wear changes need a new native release. From a clean descendant of that build:

```sh
npm run ota:publish -- --dry-run --message "Describe the tested update"
npm run ota:publish -- --message "Describe the tested update"
```

The dry run checks ancestry, runtime, native fingerprint, channel, and Expo environment without publishing.
The default baseline is the last local native build; pass `--baseline <file>` when using a retained baseline for
the build actually installed. Authentication and baseline details are in the [local OTA guide](mobile-release.md#publish-ota-through-expo).
A successful publish makes the update available; fully close/reopen the phone app after it downloads. Wear is unchanged.

## Maintainer references

- [Compatibility and provenance](release-compatibility.md): version contracts, token boundaries, receipts, and recovery trust
- [Protected Android store releases](native-store-release.md): signing, Play promotion, and signed native tags
- [Compose operations](../deploy/README.md): host configuration, upgrades, backups, and restore
- [Automated self-host deployment](../deploy/self-hosted/README.md): optional restricted WireGuard/SSH target

The old **Cut release**, **Publish prepared release**, and **Build Release Image** manual forms are replaced by
**Release server**. Their isolated workers remain implementation details. `native:submit` is replaced by
`native:release -- --skip-build`; plain `native:release` includes the build.
