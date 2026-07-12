# Android and Wear security release threat model

This review targets a private self-hosted Android/Wear release. Food names, weights, activity,
notification endpoints, profile data, and exports are treated as sensitive health-adjacent data.

| Boundary | Primary threats | Release controls |
| --- | --- | --- |
| Browser to API | CSRF, session theft, account confusion | HttpOnly secure deployed cookies, SameSite=Lax, mutation Origin guard, exact CORS allowlist, auth rate limits |
| Phone to self-host | Cleartext interception, malicious server switch | Release HTTPS requirement, credential-free origins, capability probe before switching, server-scoped session cleanup |
| Phone/watch pairing | Nearby replay, wrong account/server/node | Phone-initiated five-minute exchange, server-bound one-time token, signed P-256 challenge, exact node/account/origin correlation |
| Device storage | Backup migration, token extraction, cross-account replay | OS backup disabled, phone SecureStore, Wear Keystore AES-GCM, origin/account outbox namespaces, validated idempotent replay |
| Health Connect | Excess permissions, checkpoint mixing, silent weight replacement | Read-only declarations, optional weight request, account/install/type checkpoints, bounded resets, manual weight authority |
| Imports and avatars | Oversized/compressed denial, executable upload | 2 MiB JSON limit, 25 MiB archive limit, 5 MiB uncompressed CSV-entry limits, in-memory parsing, processed avatar allowlist and cap |
| Notifications | Token misuse, third-party disclosure, unsafe links | Bearer-session ownership, token validation, operator-disabled default, capability negotiation, generic reminders, allowlisted routes |
| Logs and diagnostics | Credentials or health values in logs | Disabled-by-default diagnostics, bounded counters, protected metrics, opaque IDs, exception type only without message or stack |

## Cross-account isolation invariant

User-owned reads and mutations derive `user.id` from the authenticated principal and retain it in
database predicates. Wear routes additionally require a Wear session. Health Connect device ids and
push ownership come from the bearer session, never request JSON. Numeric resource ids alone never
authorize a read, update, delete, undo, or association.

## Release evidence still required

- Exercise CSRF from cross-site and same-site sibling origins through the production proxy.
- Inspect merged release manifests and Play declarations for unexpected storage, overlay,
  microphone, Health Connect write, sensor, or location permissions.
- Run release-signed backup/restore and uninstall/reinstall tests on phone and watch.
- Capture hostile-LAN traffic and confirm release builds refuse HTTP.
- Revoke sessions and switch accounts/servers offline; verify old outbox, tile, pairing,
  notification, and Health Connect state is not shown or replayed.
- Review lock-screen previews and export sharing on the Galaxy Watch Ultra and phone used for dogfood.
