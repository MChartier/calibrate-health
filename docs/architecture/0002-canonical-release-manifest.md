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
mirrors. The release-tag workflow reads the stable server version from the manifest, verifies it advances beyond the
latest stable tag, and refuses to create a tag for a prerelease version.

Semantic-version comparison follows prerelease precedence. Build metadata does not affect ordering. Raising a
minimum supported client version remains an explicit compatibility decision documented in release notes.

## Consequences

- Version bumps happen in reviewed source before a release workflow runs.
- A tag cannot silently select a different release identity.
- Internal prereleases can be represented but cannot be promoted through the production tag workflow.
- Version-code monotonicity and signing-certificate equality still require artifact/store evidence.
