# Security policy

Calibrate is a self-hosted health-tracking service. Operators are responsible for TLS, database and
backup access, host patching, and timely upgrades; the project is responsible for publishing clear
security fixes and migration guidance for the supported release line.

## Supported versions

Until the first stable native release is published, only the latest commit on the active release
branch is supported. After 1.0.0, the latest stable server release and the client minimums advertised
by `/api/v1/client-config` are supported. Older images or APKs receive security fixes only when the
release notes explicitly say so.

## Reporting a vulnerability

Do not publish details of suspected credential exposure, authorization bypass, health-data
disclosure, unsafe pairing, or remote code execution. Private vulnerability reporting is not yet
enabled for this repository. Until it is enabled, contact the maintainer through an existing private
channel; if none is available, open a detail-free issue asking the maintainer to establish one.
Include the affected commit/version, deployment topology, reproduction steps, impact, and whether
any real user data was involved only after a private channel exists. Do not attach live tokens,
passwords, database dumps, signing keys, or unredacted exports.

The maintainer should acknowledge a report within seven days, publish a severity and remediation
plan after reproduction, and issue or document a mitigation before public disclosure. This is a
best-effort personal project policy rather than a commercial support SLA.

## Operator response

For a suspected compromise:

1. Stop public ingress while preserving encrypted backups and bounded diagnostic evidence.
2. Rotate session, database, food-provider, push, proxy, and signing/upload credentials that may be
   exposed. Revoking server sessions does not erase already exported or backed-up data.
3. Upgrade to the fixed immutable image/tag and run all documented migrations.
4. Revoke affected browser, phone, and Wear sessions; verify old refresh tokens and pairing tickets
   fail before restoring access.
5. Review proxy/application logs using request IDs without copying health payloads into an issue.

## Release security gates

High or critical production dependency and container findings block release unless the repository
documents reachability, owner, mitigation, and an expiry date. Release evidence also includes merged
Android/Wear permissions, matching signing identities, TLS/cleartext refusal, real Postgres migration
and restore checks, cross-account authorization tests, and public privacy/deletion mechanisms.
