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
commit. Validation covers synchronized release configuration, dependency and API/deploy contracts, Expo web release
checks, production-image startup, and high/critical vulnerability scanning. An encrypted database rollback rehearsal
runs only when migrations changed since the previous stable tag. Full Playwright/UX regression suites, performance
diagnostics, and native validation remain outside this explicit server/web release cut.

The candidate is merged through an action-created version-only PR only when `master` still points to the source commit
selected at dispatch. The workflow verifies and pushes the exact GitHub-generated PR merge commit without force; the
server-side fast-forward check atomically rejects a concurrent `master` update. Publishing tags the validated candidate
commit after proving it is an ancestor of `master`, then calls the reusable GHCR workflow directly. A separate
manual/reusable publisher accepts the exact release commit and branch for post-merge recovery. Android phone, Wear,
Expo OTA, and self-host deployment remain independent.

## Consequences

- Parallel feature work no longer reserves or guesses release versions.
- A forgotten version bump cannot block a deployment because feature PRs do not own release identity.
- Release validation runs only for an explicit cut and is bound to one immutable candidate.
- Database rollback rehearsal adds release wall time only when a migration actually changed.
- `master` drift, including a change racing the final merge, aborts before the protected branch is updated.
- A manifest ahead of the latest tag represents one pending prepared release and blocks another bump until recovered.
- The release PR and tag add explicit provenance without creating a GitHub Release object or generated changelog.
