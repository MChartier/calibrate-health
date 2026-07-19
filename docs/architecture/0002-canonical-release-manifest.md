# ADR 0002: Use one canonical release manifest

- Status: Accepted
- Date: 2026-07-12

## Context

Server, phone, and watch releases have independent build systems but share API compatibility and signing constraints.
Previously, the tag workflow calculated the next Git tag from existing tags without checking the canonical release
manifest. That could publish a tag whose version disagreed with the server and client compatibility metadata.

## Decision

Treat `shared/release.json` as the canonical release identity and compatibility policy. Native and package metadata
remain mirrors because their build tools need values before app code runs. `npm run release:check` validates those
mirrors. On every merge to `master`, the release workflow reads the stable server version from the manifest. It is a
no-op when that version already has the latest stable tag, creates the tag when the version advances, and refuses a
regression or prerelease version. It then dispatches the current GHCR-only image workflow with the immutable release
tag as an explicit input, so an older tag cannot reintroduce its historical deployment steps.

Semantic-version comparison follows prerelease precedence. Build metadata does not affect ordering. Raising a
minimum supported client version remains an explicit compatibility decision documented in release notes.

## Consequences

- Version bumps happen in the feature PR that should publish the release; no follow-up release PR or manual bump is
  required.
- A tag cannot silently select a different release identity.
- Merges without a version change perform a fast consistency check and do not build or publish an image.
- Container publication runs every automated release and data-portability gate, but physical phone/watch evidence
  remains a separate prerequisite for distributing native production artifacts.
- Internal prereleases can be represented but cannot be promoted through the production tag workflow.
- Version-code monotonicity and signing-certificate equality still require artifact/store evidence.
