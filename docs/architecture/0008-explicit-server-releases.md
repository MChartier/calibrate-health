# ADR 0008: Prepare explicit releases through protected pull requests

- Status: Accepted; implementation extracted to the shared Expo release toolkit
- Original decision: 2026-08-22

Ordinary feature and fix PRs leave the stable server version unchanged. After changes land, the operator reviews `npm run release -- plan` and dispatches it with `npm run release -- run`. The selected server bump and paired native reservation are mapped into existing application metadata.

The shared worker creates a version-only candidate, verifies exact source and candidate checks, and merges through the PR API with its validated head. Default-branch protection remains authoritative. Publication checks the merged parents/tree; no direct push to master is permitted. An unchanged release is a no-op.

GitHub Releases retain reservations, original source/workflow/toolkit identities, verified artifacts and independent stage outcomes. Recovery reuses that history and appends evidence. It never turns an uncertain remote outcome into permission to repeat a request. Historical signer retention and current revocation survive workflow extraction.

The application retains its metadata mapping, validation commands, builders and artifact checks. The reusable toolkit owns provider retry, retention, publication, orchestration and deployment transport. See [the current release runbook](../native-store-release.md) for the commands and protected environments.
