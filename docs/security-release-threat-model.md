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

As of 2026-07-12, `npm audit --omit=dev` reports no production findings. A scoped
Expo Metro override keeps PostCSS on patched `8.5.18`; an Android Expo/Metro export verifies that
the compatible patch still bundles successfully. The former 15 moderate package entries all
collapsed to
[`GHSA-w5hq-g745-h8pq`](https://github.com/advisories/GHSA-w5hq-g745-h8pq) through the Expo 54
build-tool chain: `@expo/config-plugins` -> `xcode@3.0.1` -> `uuid@7.0.3`. The advisory affects
UUID v3/v5/v6 only when a caller supplies an undersized output buffer. The installed `xcode`
package calls only `uuid.v4()` without a buffer while generating project identifiers, so the
affected path is not reachable through this dependency. This code runs while generating native
projects and is not bundled into the server, web client, Android app, or Wear app.

Rather than changing Expo or Health Connect majors, the root lock graph now pins the CommonJS
`xcode@3.0.1` edge to patched `uuid@11.1.1`. UUID 11 exposes a CommonJS entry point, and a release
test executes xcode's actual `generateUuid()` path to guard that compatibility. Android prebuild,
bundle export, mobile typecheck/tests, and the production dependency audit must remain green. The
advisory scanner still models all published vulnerable ranges and inspects every root or nested UUID
copy, so a future Expo/config-plugin update cannot silently reintroduce the advisory.
