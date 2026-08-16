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

As of 2026-08-09, the backend production graph reports no findings with Nodemailer locked at
`9.0.5`. Version 9.0.1 was the first release to resolve every published Nodemailer advisory,
including [`GHSA-p6gq-j5cr-w38f`](https://github.com/advisories/GHSA-p6gq-j5cr-w38f). Coverage runs on `c8@12`,
and compatible patched releases remain pinned for the production and Prisma dependency edges. API
contract generation, backend coverage, and the full test suite exercise those overrides.

As of 2026-08-15, the root/mobile production audit reports 15 high package entries, all transitive effects
of two `image-size@1.2.1` findings reached through Metro 0.84.4:
[`GHSA-w3rx-r6r6-pgpr`](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) and
[`GHSA-5p2g-fcmc-qvqq`](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq). Both advisories affect
every published `image-size` release through 2.0.2, and neither has a patched release. Metro uses
this parser only while bundling repository-owned assets; deployed web, Android, Wear, and backend
artifacts do not execute it. The production audit therefore permits only those two advisory IDs at
the exact `node_modules/image-size@1.2.1` path through 2026-08-22. The checker fails closed for any
other high/critical advisory, version, or path. Container publication honors the active exception because the
affected Metro parser is absent from the published server image; external production launch remains strict and
rejects the exception even before expiry.

Beyond the production finding above, the root/mobile full audit reports 23 additional high package
entries, all from the same development-only path to
[`GHSA-mh99-v99m-4gvg`](https://github.com/advisories/GHSA-mh99-v99m-4gvg):
React Native 0.86's Jest preset pins Babel/Jest 29, which reaches `brace-expansion@1.1.16` through
`test-exclude@6` and `minimatch@3`. These packages only discover and instrument repository-owned
test files; none are bundled into the server, web client, Android app, or Wear app. A forced
`brace-expansion@5.0.8` resolution is not compatible: v5's CommonJS export is an object while
`minimatch@3` calls the dependency as a function, causing test discovery to fail. Keep this finding
visible until the React Native preset moves to a compatible Jest/tooling graph rather than masking
it with an invalid lockfile override.

The backend development graph has the same constraint on a separate OpenAPI-only edge:
`openapi-typescript@7.13.0` depends on Redocly `1.34.17`, which pins `minimatch@5.1.9`.
That minimatch release requires the callable `brace-expansion@2` API, while the only version
currently accepted by the advisory scanner is the incompatible object-exporting v5 release.
Keep Redocly on `brace-expansion@2.1.2` until its consumer upgrades to picomatch or another
compatible implementation. A backend regression test executes a brace-bearing pattern through
Redocly's exact minimatch dependency, and the dependency remains development-only.

The separate UUID advisory is fully resolved. The root graph pins the `xcode@3.0.1` edge to patched
`uuid@11.1.1`, and a release test executes xcode's actual `generateUuid()` path. Android prebuild,
bundle export, mobile typecheck/tests, and both production dependency audits must remain green.
The advisory scanner inspects every root or nested UUID copy so a future Expo/config-plugin update
cannot silently reintroduce an affected version.
