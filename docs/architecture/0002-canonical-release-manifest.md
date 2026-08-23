# ADR 0002: Use one canonical release manifest

- Status: Superseded in part by ADR 0008
- Date: 2026-07-12

The canonical-manifest decision remains active. ADR 0008 supersedes only the automatic per-merge versioning and
publication trigger described below.

## Context

Server, phone, and watch releases have independent build systems but share API compatibility and signing constraints.
Previously, the tag workflow calculated the next Git tag from existing tags without checking the canonical release
manifest. That could publish a tag whose version disagreed with the server and client compatibility metadata.

## Decision

Treat `shared/release.json` as the canonical release identity and compatibility policy. Native and package metadata
remain mirrors because their build tools need values before app code runs. `npm run release:check` validates those
mirrors and the lean acceptance policy. ADR 0008 now owns explicit release preparation, exact-candidate validation,
version-only release PR creation, tagging, and GHCR publication.

Semantic-version comparison follows prerelease precedence. Build metadata does not affect ordering. Raising a
minimum supported client version remains an explicit compatibility decision documented in release notes.

## Consequences

- Ordinary feature PRs do not change the server version; **Cut release** creates the synchronized version-only PR.
- A tag cannot silently select a different release identity.
- Merges without a version change do not publish an image.
- Physical phone/watch validation is an optional owner diagnostic, not a repository release prerequisite.
- Internal prereleases can be represented but cannot be promoted through the production tag workflow.
- Version-code monotonicity and signing-certificate equality still require artifact/store evidence.
