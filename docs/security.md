# Security model

The official hosted service operates its application, database, email delivery, logs, backups, retention, and abuse
controls. Advanced self-hosting runs the same product contract, but responsibility for those controls belongs to the
instance operator.

## Browser sessions and CSRF

The web client uses an `HttpOnly` cookie session. Production and staging default to a secure,
host-scoped cookie with `SameSite=Lax`; the recommended deployment serves the frontend and API
from one origin. Browsers therefore do not attach the session cookie to cross-site mutation
requests in the normal deployment.

Split-origin deployments must explicitly list every trusted frontend origin in `CORS_ORIGINS`.
The backend validates each request `Origin` against the API origin or that exact allowlist before
returning credentialed CORS headers. It also rejects browser mutations whose `Origin` is neither
the API origin nor that allowlist, protecting same-site sibling hosts as well as cross-site requests.
If `SESSION_COOKIE_SAMESITE=none` is required, keep
`SESSION_COOKIE_SECURE=true`, use HTTPS, and never use wildcard origins. Browser mutation requests
from an untrusted origin are rejected by the CORS origin delegate.

Native clients use opaque bearer tokens instead of browser cookies, so the cookie CSRF model does
not apply to Android or Wear OS requests. Tokens are hashed at rest on the server and stored in
Expo SecureStore on the phone.

Release Android builds require HTTPS even for private-network server addresses. Cleartext loopback
and LAN URLs are accepted only by development builds, keeping bearer, activity, and food data off
unencrypted transports in normal self-hosted use.

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

## Verification, recovery, and legal access

Email verification and password-reset credentials are random, purpose-bound, single-use values
stored only as hashes. Verification expires after 24 hours and password reset after 30 minutes.
Public request endpoints use generic HTTP 202 responses and independent rate limits so callers
cannot determine whether an account exists. Tokens, email addresses, request bodies, and SMTP
provider details are excluded from logs and diagnostics.

A successful password reset revokes every browser, Android, iOS, and Wear session. New registrations
record explicit acceptance of the exact current Terms and Privacy versions. Existing users are
marked email verified during migration but receive no synthetic legal acceptance. Sessions needing
verification or current legal acceptance retain only the narrow account-access flows documented in
`account-access-and-recovery.md`.

The official hosted service fails registration closed when SMTP is unavailable or incomplete.
Advanced self-hosted instances may keep delivery disabled; operators who enable it may use any
SMTP provider and must define a public HTTPS origin, retention terms, credential handling, and
abuse monitoring.

## Account and device sessions

Mobile access tokens are short lived and refresh tokens rotate through a database compare-and-swap,
so one presented refresh token can create at most one successor. Device sessions and their native
push endpoints can be reviewed and revoked from the app's device settings. Password changes preserve the
initiating mobile session and revoke other native sessions.

Browser sessions are persisted in Postgres and linked to the authenticated account after login.
Native push registrations are linked to the mobile session that registered them. Deleting an
account therefore removes its browser sessions, mobile sessions, web push subscriptions, and
native push tokens through database cascades rather than relying on a hosted cleanup service.

Native push defaults to disabled because Expo delivery crosses an external service boundary.
Self-hosted operators set `NATIVE_PUSH_MODE=expo` only when they accept that dependency. While
disabled, the public capability is false, Android does not request notification access, new token
registration returns `NATIVE_PUSH_DISABLED`, and stored native tokens are not delivered.

Wear mutations attach the trusted mobile-session ID to their internal idempotency receipt. This
provenance is never accepted from request JSON or exposed by the watch API; it exists only so the
watch can offer undo for its current session's latest still-existing food entry. Deleting a mobile
session clears this optional receipt link rather than deleting food history.

## Account export and deletion

Authenticated users can download a versioned `calibrate-account-export` JSON document. Version 7
includes the account's verification timestamp and explicit legal acceptance history. The export
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

Android OS backup is disabled for phone and watch builds. Phone bearer tokens use SecureStore, Wear
tokens use an Android Keystore AES-GCM key, and offline SQLite data stays in the app sandbox. Rooted
or unlocked devices, screenshots, notification previews, and user-shared exports remain outside the
server's protection boundary.
