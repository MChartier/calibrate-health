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
- Repeat merged-manifest inspection in Play App Bundle Explorer; local test-signed phone/Wear
  artifacts already exclude storage, overlay, microphone, Health Connect write, sensor, and
  location permissions.
- Repeat backup/restore and upgrade checks with permanent signing and a distributed predecessor;
  the local encrypted restore drill and test-signed install/reinstall paths are complete.
- Capture hostile-LAN traffic on physical devices; local release code, merged manifests, and
  emulator UI already reject HTTP origins and cleartext transport.
- Revoke sessions and switch accounts/servers offline; verify old outbox, tile, pairing,
  notification, and Health Connect state is not shown or replayed.
- Review lock-screen previews and export sharing on the Galaxy Watch Ultra and phone used for dogfood.

## Dependency advisory resolution

As of 2026-08-07, the backend lock graph has no high or critical production findings. The
root/mobile graph has no unexcepted high or critical production findings. Coverage runs on `c8@12`,
and compatible patched releases remain pinned for the production and Prisma dependency edges. API
contract generation, backend coverage, and the full test suite exercise those overrides.

The root/mobile production graph temporarily reports two no-fix `image-size` advisories:
[`GHSA-w3rx-r6r6-pgpr`](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
[`GHSA-5p2g-fcmc-qvqq`](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq). Both describe parser
infinite loops and affect every published version through `2.0.2`; no patched release is available.
The locked `image-size@1.2.1` copy is reached only through Expo's Metro build-tool chain, where it
inspects repository-owned assets. User uploads and food-provider images do not pass through Metro.
The production audit may filter only package entries whose complete advisory chain resolves to
these two ids, only while the lock graph remains exactly `image-size@1.2.1`, and only through
2026-08-20. A changed dependency version, another advisory, the deadline, or strict production
release validation fails the exception.

The full root/mobile audit reports the same 15 package entries rooted in those two `image-size`
advisories and no additional findings. A separate development-only Istanbul edge is pinned to
patched `js-yaml@3.15.1`; keeping the override scoped to `@istanbuljs/load-nyc-config@1.1.0`
prevents it from changing Expo's independent `js-yaml@4` dependency.

The separate UUID advisory is fully resolved. The root graph pins the `xcode@3.0.1` edge to patched
`uuid@11.1.1`, and a release test executes xcode's actual `generateUuid()` path. Android prebuild,
bundle export, mobile typecheck/tests, and both production dependency audits must remain green.
The advisory scanner inspects every root or nested UUID copy so a future Expo/config-plugin update
cannot silently reintroduce an affected version.
