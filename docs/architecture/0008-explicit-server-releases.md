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
Expo OTA workflow for the exact release commit without waiting for or triggering self-host deployment. The
native-build reference comes from the canonical manifest. OTA publishes internal first and waits for protected
production approval; it is never triggered by an ordinary `master` push.

Expo's public client API performs update check and update fetch as separate latest-channel selections; it cannot pin
the fetch to the manifest returned by the check. The client therefore revalidates fetched metadata, does not
immediately restart into a mismatched update, and gates every startup. That containment is not atomic: an already
fetched mismatched update can remain eligible for a later cold start. A future atomic design requires EAS channels or
aliases scoped to a server release and selected on-device, or a custom update server. A live-server check in GitHub
Actions cannot close this client-side race and is not part of the release workflow.

## Consequences

- Parallel feature work no longer reserves or guesses release versions.
- A forgotten version bump cannot block a deployment because feature PRs do not own release identity.
- Release validation is bound to one immutable candidate and stays limited to metadata integrity and a cross-cutting
  production smoke.
- Targeted pull-request and scheduled checks remain the source of truth for broader validation.
- `master` drift, including a change racing the final merge, aborts before the protected branch is updated.
- A manifest ahead of the latest tag represents one pending prepared release and blocks another bump until recovered.
- The release PR and tag add explicit provenance without creating a GitHub Release object or generated changelog.
- OTA updates follow explicit release image publication, remain tied to the installed native build, and never publish
  merely because `master` advanced.
- Serialized OTA publication and production approval reduce channel churn but cannot make Expo's separate client
  check/fetch operations atomic.
