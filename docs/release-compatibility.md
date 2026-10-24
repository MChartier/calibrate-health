# Release compatibility and artifact provenance

Start with the [fresh-history cutover](release-cutover.md). Legacy release recovery and baseline import are intentionally unavailable.

`shared/release.json` is the canonical release manifest for the server, the shared Expo mobile compatibility line,
the Android app, and the Wear OS app. Android and iOS Expo clients share its semantic mobile version and minimum-version
policy; Expo config and client-diagnostic allowlists mirror those values. Android build files also mirror the manifest
because Expo and Gradle need native values before application code runs; `npm run release:check` fails quickly when any
mirror drifts.

## Compatibility policy

Calibrate uses semantic `version_name` values for compatibility decisions and positive, monotonically increasing
Android `version_code` values for upgrades. A self-hosted server should support every API listed in
`server.api.supported`. It may raise a minimum client version only when older releases cannot operate safely or
correctly; routine feature additions should remain backward compatible.

The Android native version remains independent from the server/web version. Each JavaScript bundle separately carries
the `shared/release.json` server version whose contract it expects. Bundle and server major versions must match.
Within a major, an older client minor remains compatible with a newer server minor because the server remains backward
compatible. A newer client minor is incompatible with an older server minor because required additions may be
missing. Patch drift remains compatible. This directional boundary protects a self-host whose deployment can lag OTA
publication, even when the v1 wire changes are additive.

For example, these running-bundle checks follow `shared/releaseCompatibility.ts`:

| Bundled server contract | Selected server | Result |
| --- | --- | --- |
| `0.35.0` | `0.35.2` | Compatible; patch differences do not block use. |
| `0.34.0` | `0.35.0` | Compatible; the server supports the older client minor. |
| `0.35.0` | `0.34.0` | Blocked; update the selected server before using this bundle. |
| `0.35.0` | `1.0.0` | Blocked; the client and server majors must match. |
| `1.0.0` | `0.35.0` | Blocked; the client and server majors must match. |

These are runtime results, not promises about whether Expo downloads or launches an update. During production
approval, compare the candidate bundle's contract with the release owner's intended server rollout. An approval
cannot establish compatibility for independently managed self-hosts, so each device must still perform its own
uncached check before restoring a session or synchronizing. Do not replace that check with private-server polling
from CI or require equal minor versions when the server minor is newer.

The server returns `/api/v1/client-config` with `Cache-Control: no-store`. Before saving a server, refreshing a saved
session, or manually rechecking compatibility, the phone also requests it with Fetch `cache: 'no-store'`. It refuses
an unsupported API, an incompatible server contract version, or a native release older than
`min_supported_mobile_version` with actionable guidance. Native phone and Wear HTTP
requests also send `X-Calibrate-Client-Platform` plus `X-Calibrate-Client-Version`. The server compares the trusted
bearer-session platform with those headers on every authenticated request and requires Wear identity during the
one-time pairing exchange. Browser cookie sessions omit these headers and are unaffected.

Expo retains its normal update lifecycle; the client does not veto an update download based on the selected server.
If an incompatible bundle starts, the runtime preflight blocks normal authenticated use before session refresh and
synchronization. When a server change is selected, both OTA channels require its Compose upgrade
and application health check to succeed. An unselected server requires no deployment or health request. This checks only that target's health, not an exact server/OTA version
match; independently managed self-hosts still rely on the runtime mismatch guard.

An incompatible native request receives HTTP 426 with `CLIENT_UPGRADE_REQUIRED`, the applicable minimum version, and
a non-retryable user message. Phone keeps its credentials and offline outbox behind an update-required screen. Wear
keeps pairing, cache, and queued mutations but stops normal refresh/action work behind a dedicated update-required
state. Foregrounding that Wear screen schedules a bounded compatibility probe; a committed compatible snapshot clears
only the upgrade marker and then resumes retained queued work. This allows either an in-place watch update or a server
rollback that lowers the client floor to recover without re-pairing or discarding local data. A platform header cannot
override the device platform retained by the authenticated server session.

Compatibility changes follow these rules:

- Additive API and database changes remain compatible with the current API version.
- A breaking wire change requires a new API version while the old version remains in `supported` during migration.
- Raising a minimum client version is a last-resort safety boundary and must be called out in release notes.
- Phone and Wear artifacts must keep application ID `net.darkmachines.healthtracker` and use the same signing certificate
  for Wear Data Layer communication.
- Phone and watch use a shared native version, independent of server/web, and globally unique odd/even version codes.

## Channels

| Channel | Phone artifact | Wear build type | Intended use |
| --- | --- | --- | --- |
| `debug` | Local Expo/Gradle debug | `debug` | Emulator and development devices only |
| `internal` | Locally signed release APK | `internal` | Owned-device validation before store release |
| `production` | Locally signed release AAB | `release` | Store-distributed release |

The internal Wear build uses shared release signing when all `CALIBRATE_ANDROID_SIGNING_*` values are supplied and
falls back to the repository debug key for local phone-debug pairing. The paired Gradle builder supplies the same
validated signing environment to the phone and Wear release builds. Any future EAS-built phone artifact can pair only
with a Wear artifact signed by that same certificate. Never place signing material in `shared/release.json` or
generated metadata.

Store delivery is selected by the shared release planner from phone fingerprint and Wear build-input changes. It builds and attests
one pair, queues the exact phone AAB through EAS Submit to internal, permits runtime-targeted OTA, and independently finishes
phone submission before Wear submission to wear:internal. Explicit promotions reuse exact attested codes and AAB hashes.
No signed native tag or Play acceptance is required for OTA. See [the unified release runbook](native-store-release.md).

## Release implementation and recovery

The [protected release runbook](native-store-release.md) covers component selection, approvals, retained artifacts and historical recovery. The [local guide](mobile-release.md) covers native builds and device installation. The shared toolkit owns provider protocols and durable state; application compatibility assertions remain here.
