# Protected releases

Start with the [fresh-history cutover](release-cutover.md). Legacy release recovery and baseline import are intentionally unavailable.

Calibrate consumes the pinned `@mchartier/expo-release` package and workers. `release.config.json` defines its components, existing metadata mappings, Android pair, tracks, environments and deployment values. See [shared implementation](https://github.com/MChartier/expo-release-template) for the common contract and recovery protocols.

From a clean committed checkout:

```powershell
npm.cmd run release -- validate --source
npm.cmd run release -- plan
npm.cmd run release -- run
npm.cmd run release -- status
```

Review the plan before running it. `run` dispatches the read-only **Release request** workflow; its default-branch handler independently verifies the request and uses the same pinned toolkit revision. Hosted execution revalidates source and baselines. A pending release blocks new reservations. `--bump minor|major` changes the selected server reservation; phone/Wear reserve paired patches with globally unique odd/even codes. Native metadata changes select the server because its diagnostics expose those versions.

The shared worker prepares a version-only PR, validates exact source and candidate, and uses the protected PR merge API with the validated head. It never pushes master. Source inspection, installation and exports receive no publication credentials. Publishers use independently obtained toolkit code and verified retained inputs. Application hooks only inspect inputs, transform metadata, validate, build or check application artifacts.

## Stages and approvals

Selected server builds publish an attested GHCR image; the existing WireGuard webhook then provides application health evidence. Its healthy response does not prove an exact deployed image digest. Keep the existing Compose files, webhook service and runtime compatibility guards.

The command builder produces phone and Wear APK/AAB artifacts once and retains hashes and provenance. Phone submission handoff precedes dependent OTA; final native success requires submission completion, and phone completion precedes Wear submission. An OTA success survives a later native failure. Production OTA requires the exact retained native runtime. Internal OTA preserves source-validated publication with its independently resolved internal fingerprint; it does not claim compatibility with the production-channel binary.

Keep the existing environments and protections:

- `native-release-signing`: the four `CALIBRATE_ANDROID_*` upload-signing secrets, isolated from publication.
- `play-internal`: protected submission using the exact app's assigned EAS Play credential. Tracks remain `internal` and `wear:internal`.
- `production`: reviewer approval before production OTA environment resolution, export and publication. `EXPO_TOKEN` remains project-wide authority; this approval controls sequencing, not channel-scoped credentials.
- `play-internal` / `play-production`: existing testing/production Play service accounts for explicit promotions.
- `self-hosted-testing`: existing WireGuard/webhook variables and secrets; see [deployment onboarding](../deploy/self-hosted/README.md).

Do not edit the same Play app in Console or another publisher while a submission/promotion is active. Keep native tag public keys and historical signer allow/revoke files for old evidence; new artifacts use shared provenance. A current revocation overrides historical retention.

## Retained operations and recovery

`plan --operation build|ota --targets ID,...` selects an explicit build or OTA operation. `plan --operation submit|deploy|promote --release-id ID` uses verified retained artifacts. Promotion also requires `--promotion closed` or `--promotion production`; then review and `run` the prepared plan. Local commands dispatch protected operations through Actions and retain environment approvals.

`status --release-id ID` and `recover --release-id ID` only inspect. Mutations are explicit:

```powershell
npm.cmd run release -- recover --release-id ID --resume
npm.cmd run release -- recover --release-id ID --retry --stage STAGE
npm.cmd run release -- recover --release-id ID --reconcile evidence.json --stage STAGE
npm.cmd run release -- recover --release-id ID --abandon --reason "Audited reason for abandoning this reservation"
```

GitHub Releases are the durable ledger. Successful independent stages, original producing runs, provider IDs, destinations and reservations remain intact. Recovery appends evidence; it does not rewrite original records, relabel local evidence as hosted, or allocate another version pair. Unknown enqueue/publication outcomes and timed-out webhook calls block repetition until reconciliation proves the permitted action. Follow the toolkit's provider-specific evidence schema; an empty search result is not proof that nothing happened.

The held original release `411201908` retains native `0.2.9` / phone 17 / Wear 18 and its partial-success state. This migration does not resume or alter it. Its recovery fixture checks original artifact/source identity and the explicit rejected-track correction before any new enqueue. Actual recovery remains a separate owner-directed operation. A missing original artifact or revoked signer fails closed; never silently rebuild and substitute accepted bytes.

Local Android builds and receipts are documented in [mobile release](mobile-release.md). They never establish protected hosted provenance.
