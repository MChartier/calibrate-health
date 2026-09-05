# ADR 0008: Cut server and web releases explicitly after merge

- Status: Accepted
- Date: 2026-08-22

## Context

The canonical release manifest previously advanced inside feature PRs. Because several changes can be in flight at
once, contributors had to predict merge order to keep versions monotonic. Missed bumps also required follow-up PRs,
while every `master` push started release-specific validation even when no new manifest version existed.

The repository ruleset requires changes to `master` to arrive through pull requests. Server/web releases therefore
need an explicit preparation step that can own the synchronized version commit without bypassing that rule.

## Decision

Ordinary feature and fix PRs leave the stable server version unchanged. After changes land on `master`, an operator
runs **Cut release** and chooses a strict `patch`, `minor`, or `major` increment. The workflow requires the manifest to
match the highest stable tag, prepares all server/web mirrors on `release/vMAJOR.MINOR.PATCH`, and validates that exact
commit. Validation covers candidate identity, synchronized release configuration, the exact generated mirror set, and
a production-image startup and served-Web smoke. Affected pull-request and scheduled workflows own the broader unit,
integration, API/deploy, dependency, vulnerability, and database checks; the version-only release candidate does not
replay them.

The candidate is merged through an action-created version-only PR only when `master` still points to the source commit
selected at dispatch. The workflow verifies and pushes the exact GitHub-generated PR merge commit without force; the
server-side fast-forward check atomically rejects a concurrent `master` update. Publishing tags the validated candidate
commit after proving it is an ancestor of `master`, then calls the reusable GHCR workflow directly. A separate
manual/reusable publisher accepts the exact release commit and branch for post-merge recovery. Android phone, Wear,
and self-host deployment remain independent. After the GHCR image is published, the publisher invokes the reusable
Expo OTA workflow for the exact release commit only when the canonical manifest's native-build tag has been published.
A reserved but missing native tag records an OTA skip without failing the server/image release; recovery can rerun the
publisher after the signed native baseline is uploaded and tagged. OTA publishes internal first and waits for
protected production approval; it is never triggered by an ordinary `master` push or self-host deployment.

An optional deployment job updates the owner's configured self-host over WireGuard/SSH using the image publisher's
receipt-verified immutable digest, including recovered publications. It runs independently alongside OTA, even when
OTA is skipped for an unavailable native baseline, and does not gate OTA. See
[automatic self-host deployment](../../deploy/self-hosted/README.md).

Expo's automatic check and download lifecycle remains unchanged. Client configuration responds with
`Cache-Control: no-store`; server selection, startup before restoring a saved session or synchronizing, and manual
compatibility recheck also request it with Fetch `cache: 'no-store'`. Once a bundle runs, the phone compares its bundled
expected server contract version with that response. Different majors block in either direction. Within a major, a
client minor may trail the server minor but may not lead it; patch drift remains compatible. This runtime check does
not claim to prevent the update from downloading or starting. Protected production approval is the current
public-channel promotion control. A future automated promotion rule may require an explicit readiness signal for the
release owner's declared server rollout, but it cannot attest every independent self-host. The optional deployment
job verifies only its configured target; independent installations retain the runtime guard and are not polled to gate OTA.

## Consequences

- Parallel feature work no longer reserves or guesses release versions.
- A forgotten version bump cannot block a deployment because feature PRs do not own release identity.
- Release validation is bound to one immutable candidate and stays limited to metadata integrity and a cross-cutting
  production smoke.
- Targeted pull-request and scheduled checks remain the source of truth for broader validation.
- `master` drift, including a change racing the final merge, aborts before the protected branch is updated.
- A manifest ahead of the latest tag represents one pending prepared release and blocks another bump until recovered.
- The release PR and tag add explicit provenance without creating a GitHub Release object or generated changelog.
- OTA updates follow explicit release image publication, remain tied to a published native-build tag, and never publish
  merely because `master` advanced. A missing native tag skips OTA without rolling back the independent server/image
  release.
- Protected production approval controls public promotion, while independently managed self-hosts remain protected
  by the runtime directional contract-version guard.
