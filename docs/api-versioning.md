# API compatibility policy

`/api/v1` is the current stable resource API for web, Android, and future Wear OS clients. The
unversioned `/api` mount remains a compatibility alias while existing clients migrate; it has no
sunset date until a released client no longer depends on it. Native authentication remains under
`/auth/mobile/*` and follows the v1 contract documented in `docs/openapi/v1.yaml`.

Within v1, changes may add optional response fields, new endpoints, new optional request fields,
or new enum values when clients already have an unknown-value fallback. Removing or renaming a
field, changing its meaning/type, making an optional field required, or changing idempotency and
conflict semantics requires a new API version.

`GET /api/v1/client-config` is uncached and advertises the current and supported API versions, the legacy alias,
canonical server version, minimum supported mobile version, and capabilities. A server that must reject an
obsolete native client should raise the matching `min_supported_mobile_version` or `min_supported_wear_version`;
clients should compare it
before starting normal synchronization and present an actionable upgrade message.

The native JavaScript bundle independently records the `shared/release.json` server version it expects. Before
restoring a saved session or selecting a server, the phone compares that value with
`client-config.server_version`. Major versions must match. Within the same major, an older client minor remains
compatible with a newer server minor because the server remains backward compatible; a newer client minor is
incompatible with an older server minor because required additions may be missing. Patch differences remain
compatible. This directional server-version rule does not replace API-version negotiation or the minimum native
Android/Wear version floor.

The OpenAPI source is executable project state. Run `npm run api:generate` after contract edits and
commit the generated types. `npm run api:contract:check` fails when generated types drift from the
source contract, and PR CI runs that check from a clean install.
