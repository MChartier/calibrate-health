# Unified server, Android, and OTA releases

Run **Cut release** on `master`. Its summary lists the selected components and the source changes that selected them before anything is published. The `bump` input applies only when server/web is selected. Native changes automatically reserve a paired patch version; a valid higher reservation is reused. Documentation, tests, and version bookkeeping do not select application publications. Native diagnostic metadata remains a real server dependency.

The workflow compares separate successful source references for server/web, paired native builds, internal OTA, and production OTA. Phone native compatibility uses Expo's fingerprint policy; Wear uses its tracked build inputs. The first integrated cut creates a new native baseline. Existing appVersion installations need one new native installation to receive fingerprint updates.

## Publication order

1. Prepare selected version changes together in one protected release PR. Run exact-candidate validation and required CI, then merge through the SHA-bound PR API. Client-only cuts without version changes use the original protected source; no-op cuts create nothing.
2. Publish the selected server image and build/verify both selected native clients. Retain all four APK/AAB files, hashes, source/version metadata, and GitHub attestation.
3. If server/web was selected, deploy `latest` through the existing WireGuard webhook and require completed application health. Otherwise there is no deployment or health request.
4. Queue the exact phone AAB through the locked EAS Submit CLI using the `phone` profile and Play track `internal`. Capture its submission ID and verify its Expo project, Android platform, and track.
5. Publish applicable internal OTA after that handoff, followed by one reviewer approval in the existing GitHub
`production` environment before production environment resolution, export, and publication.
6. Independently monitor phone submission; after it succeeds, queue and monitor the exact Wear AAB using the `wear` profile and `wear:internal` track. Later submission failure fails the release, but does not cancel or undo OTA.

A build failure or failure to establish the initial phone submission blocks OTA. Play processing, review, or production acceptance does not gate OTA. Expo serves each update only to matching runtimes. The production APK, AAB, and OTA export must agree on the resolved runtime.

The Android package CI job also compares the clean managed source fingerprint with the built APK and post-build source. Kotlin's generated `.kotlin` compiler-session/cache files are excluded from fingerprint inputs; native plugin source and Gradle integrity templates remain included. A runtime mismatch stops publication and reports both hashes.

All CI Play-writing operations share one non-cancelling concurrency group. Do not edit the same Play application through another Console/API client while submissions or promotion are running. Google documents that [concurrent edits can invalidate one another or submit pending Console changes](https://developers.google.com/android-publisher/concurrency-considerations).

## Configuration and rollout

Use the existing Expo project `fda8f8c5-e646-47ac-82fb-35003c9cbec7`, owner `calibrate-health`, slug `calibrate-health-app`, Android application `net.darkmachines.healthtracker`.

- Keep the repository `EXPO_TOKEN` secret. The token is account/project scoped, not channel scoped; production approval controls workflow sequencing and does not prevent someone holding the token from targeting production.
- Keep the GitHub `preview` environment and the existing `production` required reviewer and
   branch policy. Both public EAS environments must define the intended project, server URL, and channel. Native store artifacts use the production channel.
- Keep master-only `native-release-signing`, with its reviewer and `CALIBRATE_ANDROID_UPLOAD_KEYSTORE_BASE64`, `CALIBRATE_ANDROID_SIGNING_STORE_PASSWORD`, `CALIBRATE_ANDROID_SIGNING_KEY_ALIAS`, and `CALIBRATE_ANDROID_SIGNING_KEY_PASSWORD`.
- Keep master-only `play-internal`. Use the existing assigned Google Play submission credential in EAS. Testing-only app-scoped access is recommended; the workflow itself explicitly targets only the testing tracks, regardless of wider credential permissions. The main release uses that assigned credential; it does not read a Play JSON key from GitHub or select a latest EAS build.
- Use the app's API-returned track IDs `internal` and `wear:internal`, which already contain phone code 11 and Wear code 12. The `qa` / `wear:qa` aliases are not available for this app. Verify EAS backend acceptance of the exact Wear track during rollout; never fall back to the phone track or another destination.
- Keep separate Play promotion credentials in `play-internal` and reviewer-protected `play-production`: `GOOGLE_PLAY_TEST_SERVICE_ACCOUNT_JSON_BASE64` or `GOOGLE_PLAY_TEST_ACCESS_TOKEN` for testing; `GOOGLE_PLAY_PRODUCTION_SERVICE_ACCOUNT_JSON_BASE64` or `GOOGLE_PLAY_PRODUCTION_ACCESS_TOKEN` for production.
- Keep master-only `self-hosted-testing` with the existing WireGuard/webhook variables and three named deployment secrets. See [self-host deployment](../deploy/self-hosted/README.md). This migration creates no homelab accounts, peers, firewall rules, or SSH commands.
- After migrating active workflows, remove unused `native-release-attestation` and `native-release-tags` environments and their native tag signing/App secrets. No GitHub App, private tag-signing key, or native tag ruleset is required for new releases.

Phone 11 / Wear 12 were the original uploaded bootstrap pair. At the 2026-10-13 migration checkpoint, codes 13–16 have already been reserved by earlier abandoned runs and must not be reused. The held draft release `411201908` owns native `0.2.9` / codes 17 and 18 with verified retained artifacts; recover that same release after explicit owner approval instead of allocating another pair. Its server `0.40.3` deployment is already healthy. See [PR #485's recovery procedure](https://github.com/MChartier/calibrate-health/pull/485) for the exact rejected EAS ID, source and runtime.

Before a later new cut, inspect both Play uploads and every retained reservation. The new pair must exceed all of them, with phone odd and Wear even. Preserve already used local codes in the manifest. Confirm Publishing overview has no unrelated pending changes and pause other release edits. Check `confirm_play_console_clean` in Cut release; this acknowledgement is enforced only if native submission is selected.

Run a cut and verify its component summary, selected server deployment health, retained native artifacts, phone and Wear submission IDs, runtime-targeted OTA groups, and final component results. Approve the protected production OTA stage when ready. An application still using appVersion will not receive the new fingerprint OTA until the new native build is installed; store approval need not finish before that OTA is published. See [Expo runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/).

## Durable records and recovery

Each non-no-op orchestration owns a draft GitHub Release named `Cut release <run-id>`, tagged `release-run-<run-id>`. This identifier is independent of application versions. Its body records the producing protected run, selection/reasons, initial source, and previous successful component baselines. Append-only checkpoint assets record preparation, deployment, artifact identities, EAS submission IDs, OTA groups, and outcomes. Binaries and attested OTA exports are retained as Release assets beyond Actions artifact expiration.

[GitHub requires push access to read draft releases](https://docs.github.com/en/rest/releases/releases#list-releases). OTA checkpoint inspection and recovery therefore use isolated, workflow-pinned tooling jobs with job-scoped `contents: write`; application source verification and OTA exports remain read-only and never receive that credential.

Only one unfinished orchestration is allowed. Another Cut release fails with the pending record ID. Use **Publish prepared release** on `master`, provide `release_id`, leave the legacy commit/branch fields blank, and choose `resume`. Confirm Console coordination if native submission remains.

- Before candidate merge, rerun only failed jobs in the original Cut release while master and candidate remain unchanged. Do not recut, manually merge, or overwrite the candidate. If master advanced, reconcile the retained candidate first.
- After merge, recovery uses the original source, retained artifacts, and recorded IDs. Successful stages are skipped. It does not allocate versions or rebuild retained native artifacts.
- If a native build was attested but Release retention was interrupted, recovery downloads the exact named artifact from the recorded producing run and verifies its original attestation before retaining it. This requires the original Actions artifact to remain available (30 days). If the build or attestation itself failed, resume that original job. Recovery must not silently substitute a fresh artifact for an accepted one.
- A recorded failed EAS submission can be retried through EAS's supported retry operation on explicit recovery; its replacement ID is recorded before readback. If EAS no longer permits retry, explicitly abandon and cut a fresh higher pair.
- A wrong-track failure requires explicit `not-published` reconciliation after confirming the provider operation is terminal and the new codes were not committed to Play. Recovery reads the exact recorded EAS ID and requires an `ERRORED` result on the retired role-specific `qa`/`wear:qa` track, then records its rejection, retained AAB digest and corrected destination. EAS retry preserves the old submission configuration, so it cannot correct a track ID. After reconciliation, resume the same release with the corrected profiles and retained binaries; no version increment or rebuild is needed. The shared operation history preserves the rejected ID before one new enqueue. Do not automatically reinterpret an existing submission as targeting another track.
- An interrupted enqueue without a confirmed ID, an interrupted OTA publish, or a timed-out deployment is ambiguous. Inspect provider/service logs and reconcile it before retrying. A timed-out webhook POST may still be deploying; never send an automatic second POST.
- Explicit `abandon` preserves all successful stages and burns reserved native version codes. An unresolved remote operation must first be reconciled. Before abandoning an unmerged candidate, close its reviewed PR and remove only its unchanged branch. A merged server candidate must finish its tag/image stage before abandonment, preserving the existing server recovery contract.

Historical server releases still accept the recorded `release_commit` and `release_branch` through Publish prepared release. That path verifies/publishes the server image and deploys it; it does not invent a native baseline. **Build Release Image** remains image-only. Preserve existing server image receipt verification and the reviewed allow/revoke policy when changing shared verifier code.

Native and OTA artifact recovery verifies original GitHub-hosted producing workflow/source identities. Keep historical reviewed native signer revisions in `.github/native-play-attestation-trusted-workflow-shas` for the supported recovery window when critical tooling changes. Revocation overrides retention. Missing or conflicting evidence fails closed; do not adopt an unrelated binary or EAS submission.

## Explicit Play promotions and client-only OTA

**Native Android Store Release** accepts the durable `release_id` and `promote-closed` or `promote-production`. Both EAS submissions must have succeeded. Promotion verifies the retained native attestation and exact Play AAB hashes/version codes, then promotes that pair without rebuilding. Closed tracks are `closed` and `wear:closed`; production tracks are `production` and `wear:production`. Production keeps its separate protected environment and credential.

**Publish Expo OTA Update** accepts an exact protected `source_ref`, message, and channel selections. It stays client-only: no server deployment, deployment credentials, native tag input, or Play acceptance check. Source exports do not receive Expo tokens. Isolated publishers receive inert exported files and the exact recorded runtime string, so they cannot recompute a fingerprint from their minimal workspace.

Local commands remain `native:build`, `native:install`, `native:submit`, and `ota:publish`; see [mobile release](mobile-release.md). Local uploads do not become CI provenance. New protected native artifacts always use fresh available codes and the CI attestation path.

### Reconcile an interrupted remote call

Choose `recovery_operation=reconcile` in **Publish prepared release**, supply the same `release_id`, and provide `reconciliation` JSON. This operation only reads the provider and appends an audited checkpoint; it does not resume publication. Then dispatch `resume` or `abandon` separately.

```json
{"stage":"phone-submit","status":"observed","id":"EXACT-EAS-SUBMISSION-UUID","artifact_hash":"RETAINED-AAB-SHA256","evidence":"Matched the exact retained AAB, code and source in the provider logs.","confirmed":true}
```

Stages are `phone-submit`, `wear-submit`, `ota-internal`, `ota-production`, and `deploy`. For OTA, use the exact update group ID and retained `bundle_integrity`; inspect the provider manifest/assets to confirm they match the retained export. EAS readback additionally verifies channel and runtime, but those alone do not prove identical bytes. For deployment, leave `id` and `artifact_hash` empty and confirm the service logs show the intended upgrade completed with `healthy: true`.

Only after confirming that no remote publication occurred and none remains in progress may an operator use `status: "not-published"`, with empty ID/hash and supporting evidence. This explicitly permits a subsequent resume to make one new call. Never use it just because a response timed out. Evidence is stored in the release record: include no secrets.
