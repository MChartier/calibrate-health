# Security model

## Browser sessions and CSRF

The web client uses an `HttpOnly` cookie session. Production and staging default to a secure,
host-scoped cookie with `SameSite=Lax`; the recommended deployment serves the frontend and API
from one origin. Browsers therefore do not attach the session cookie to cross-site mutation
requests in the normal deployment.

Split-origin deployments must explicitly list every trusted frontend origin in `CORS_ORIGINS`.
The backend validates each request `Origin` against the API origin or that exact allowlist before
returning credentialed CORS headers. If `SESSION_COOKIE_SAMESITE=none` is required, keep
`SESSION_COOKIE_SECURE=true`, use HTTPS, and never use wildcard origins. Browser mutation requests
from an untrusted origin are rejected by the CORS origin delegate.

Native clients use opaque bearer tokens instead of browser cookies, so the cookie CSRF model does
not apply to Android or Wear OS requests. Tokens are hashed at rest on the server and stored in
Expo SecureStore on the phone.

## Authentication abuse controls

Login, registration, mobile refresh, and password-change endpoints have independent IP-based
fixed-window limits. A limit response uses HTTP 429 with a JSON `message` and standard rate-limit
headers; food, weight, health checks, and normal synchronization traffic are not throttled by
these auth-specific limiters.

Wear credential issuance has both a coarse pre-authentication IP limit and a post-authentication
per-phone-session limit. Pairing origins require HTTPS in production and staging. Operators of an
intentionally cleartext LAN/loopback self-host must set `ALLOW_INSECURE_WEAR_PAIRING=true`; the
backend emits an actionable warning because pairing credentials and health data can be intercepted.

Helmet supplies baseline browser security headers. Content Security Policy is intentionally
deferred until allowed image and proxy origins can be configured without breaking self-hosted
instances; do not treat the current header set as a substitute for a deployment-specific CSP.

## Account and device sessions

Mobile access tokens are short lived and refresh tokens rotate through a database compare-and-swap,
so one presented refresh token can create at most one successor. Device sessions and their native
push endpoints can be reviewed and revoked from Android settings. Password changes preserve the
initiating mobile session and revoke other native sessions.

Browser sessions are persisted in Postgres and linked to the authenticated account after login.
Native push registrations are linked to the mobile session that registered them. Deleting an
account therefore removes its browser sessions, mobile sessions, web push subscriptions, and
native push tokens through database cascades rather than relying on a hosted cleanup service.

## Account export and deletion

Authenticated users can download a versioned `calibrate-account-export` JSON document. The export
contains profile and preference data, the optional inline avatar as base64, goals, body metrics,
food logs and completed-day state, My Foods and recipe snapshots, and in-app notification history.
When enabled, it also contains user-visible Health Connect source records and daily activity
summaries. It deliberately excludes password hashes, browser/mobile session credentials, push
endpoints and tokens, Health Connect changes tokens and device identifiers, tombstones, and
internal idempotency/synchronization metadata.

Permanent deletion requires the current account password. The user row is the transaction root;
foreign-key cascades remove all directly owned tracking data, browser/mobile sessions, push
subscriptions, notifications, and synchronization metadata. The request session cookie is also
cleared. Both operations use only the instance's local API and Postgres database, so self-hosted
deployments do not depend on `calibratehealth.app` to export or delete account data.

Calibrate cannot remove copies maintained outside the active application database. Self-hosted
operators remain responsible for reverse-proxy and application logs, database backups, backup
expiration, and preventing a restored backup from unintentionally reactivating a deleted account.
The Android client can also retain pending offline mutation payloads in app-local SQLite, scoped by
server origin and account id. Server-side deletion cannot remotely erase those local records or an
export file the user has already shared; users should clear app data and saved exports separately
when removing data from a shared device.
