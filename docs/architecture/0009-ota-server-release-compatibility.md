# ADR 0009: Block incompatible client/server contract versions at runtime

- Status: Accepted
- Date: 2026-08-23

## Context

Server image publication, deployment to a self-host, and Expo OTA publication are independent. An OTA may therefore
start before an operator deploys the corresponding server image. The release workflow also cannot reliably contact a
private self-host, and one EAS channel can serve clients that have selected different servers.

The Android native application version is independent of the server/web release. It identifies native runtime
compatibility and cannot describe which server contract an OTA JavaScript bundle expects.

## Decision

The server version in `shared/release.json` is also the server contract version of the JavaScript bundle produced from
that release. Client and server major versions must match. Within a major, an older client minor remains compatible
with a newer server minor because the server remains backward compatible. A newer client minor is incompatible with
an older server minor because the client may require additions that server does not have. Patch, prerelease, and
build-metadata differences do not affect this decision.

The server reports the canonical manifest version from uncached `GET /api/v1/client-config`. Native startup checks
that value before refreshing a saved session or starting synchronization. Server selection runs the same check before
sending credentials. A mismatch blocks normal authenticated runtime behind a dedicated screen while retaining
credentials and queued offline changes. Rechecking after the server and client converge restores the retained session.
This directional contract-version check is separate from the existing minimum-native-version policy and its
`CLIENT_UPGRADE_REQUIRED` response.

Expo's automatic and manual update behavior remains unchanged. The client does not inspect or veto an OTA candidate
based on the selected server, so this decision requires no native Expo configuration change or replacement signed
build.

Longer term, an incompatible update should be kept out of production/public channels. Promotion should require an
explicit deployment-readiness signal that the declared server rollout is compatible with the candidate bundle while
internal publication remains available for validation. That signal covers the release owner's declared server
rollout, not every independently managed self-host. CI must not infer readiness by polling a private or manually
deployed self-host, so the runtime guard remains necessary.

## Consequences

- An incompatible bundle starts far enough to fetch client configuration, then blocks normal authenticated use.
- The app preserves the saved session and offline outbox while the server or client is updated.
- Patch drift does not interrupt the app or delay an OTA.
- Within a major, a server minor can advance before clients, but a client minor cannot advance ahead of the server.
- A major mismatch blocks in either direction until the server and client converge.
- This short-term runtime guard does not prevent an incompatible bundle from being downloaded.
- Public-channel promotion gating is a separate release-workflow follow-up.
