# Android and Wear security release threat model

Use this checklist when reviewing an Android/Wear release, including a self-hosted distribution.
Food names, weights, activity, notification endpoints, profile data, and exports are treated as
sensitive health-adjacent data.

| Boundary | Primary threats | Release controls |
| --- | --- | --- |
| Browser to API | CSRF, session theft, account confusion | HttpOnly secure deployed cookies, SameSite=Lax, mutation Origin guard, exact CORS allowlist, auth rate limits |
| Phone to self-host | Cleartext interception, malicious server switch | Release HTTPS requirement, credential-free origins, capability probe before switching, server-scoped session cleanup |
| Phone/watch pairing | Nearby replay, wrong account/server/node | Phone-initiated five-minute exchange, server-bound one-time token, signed P-256 challenge, exact node/account/origin correlation |
| Device storage | Backup migration, token extraction, cross-account replay | OS backup disabled, phone SecureStore, Wear Keystore AES-GCM, origin/account outbox namespaces, validated idempotent replay |
| Health Connect | Excess permissions, checkpoint mixing, silent weight replacement | Read-only declarations, optional weight request, account/install/type checkpoints, bounded resets, manual weight authority |
| Imports and images | Oversized/compressed denial, executable upload, OCR resource exhaustion | 2 MiB JSON, 25 MiB archive, 5 MiB CSV-entry limits, processed-avatar allowlist/cap, bounded label images and single-slot OCR with cancellation/deadline; see [label scanning](nutrition-label-scanning.md) |
| Notifications | Token misuse, third-party disclosure, unsafe links | Bearer-session ownership, token validation, operator-disabled default, capability negotiation, generic reminders, allowlisted routes |
| Logs and diagnostics | Credentials or health values in logs | Disabled-by-default diagnostics, bounded counters, protected metrics, opaque IDs, allowlisted error categories without messages or stacks |

## Cross-account isolation invariant

User-owned reads and mutations derive `user.id` from the authenticated principal and retain it in
database predicates. Wear routes additionally require a Wear session. Health Connect device ids and
push ownership come from the bearer session, never request JSON. Numeric resource ids alone never
authorize a read, update, delete, undo, or association.

## Candidate-specific validation

- Exercise CSRF from cross-site and same-site sibling origins through the production proxy.
- Inspect the exact phone/Wear artifacts in Play App Bundle Explorer for forbidden storage,
  overlay, microphone, Health Connect write, sensor, and location permissions.
- Run encrypted backup/restore and same-signer upgrade checks with the distributed predecessor.
- Verify physical release clients reject HTTP origins and cleartext transport, including on a hostile LAN.
- Revoke sessions and switch accounts/servers offline; verify old outbox, tile, pairing,
  notification, and Health Connect state is not shown or replayed.
- Review lock-screen previews and export sharing on the Galaxy Watch Ultra and phone used for dogfood.

## Dependency review

Audit results belong to the exact lockfiles and scan date. Use fresh results rather than counts
from an earlier PR or release:

```sh
npm audit --omit=dev --audit-level=high
npm --prefix backend audit --omit=dev --audit-level=high
npm run audit:eas-cli:high
```

The [Dependency Audit workflow](../.github/workflows/dependency-audit.yml) defines the automated
workspace and severity checks. Review the affected dependency path and runtime exposure when
triaging a finding; this document grants no advisory exception.

Inspect full root/backend audits when changing development tooling too. Trace each finding to
its actual runtime or build-time consumer before choosing a fix. Do not force an incompatible
major override merely to clear an audit: preserve the relevant import/build behavior, including
[the xcode UUID compatibility test](../scripts/xcode-uuid-compatibility.test.mjs).
