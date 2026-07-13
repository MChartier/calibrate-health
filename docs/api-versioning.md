# API compatibility policy

`/api/v1` is the current stable resource API for web, Android, and future Wear OS clients. The
unversioned `/api` mount remains a compatibility alias while existing clients migrate; it has no
sunset date until a released client no longer depends on it. Native authentication remains under
`/auth/mobile/*` and follows the v1 contract documented in `docs/openapi/v1.yaml`.

Within v1, changes may add optional response fields, new endpoints, new optional request fields,
or new enum values when clients already have an unknown-value fallback. Removing or renaming a
field, changing its meaning/type, making an optional field required, or changing idempotency and
conflict semantics requires a new API version.

`GET /api/v1/client-config` advertises the current and supported API versions, the legacy alias,
server version, minimum supported mobile version, and capabilities. A server that must reject an
obsolete native client should raise `min_supported_mobile_version`; clients should compare it
before starting normal synchronization and present an actionable upgrade message.

The OpenAPI source is executable project state. Run `npm run api:generate` after contract edits and
commit the generated types. `npm run api:contract:check` fails when generated types drift from the
source contract, and PR CI runs that check from a clean install.
