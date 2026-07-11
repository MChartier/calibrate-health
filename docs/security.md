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

Helmet supplies baseline browser security headers. Content Security Policy is intentionally
deferred until allowed image and proxy origins can be configured without breaking self-hosted
instances; do not treat the current header set as a substitute for a deployment-specific CSP.

## Account and device sessions

Mobile access tokens are short lived and refresh tokens rotate through a database compare-and-swap,
so one presented refresh token can create at most one successor. Device sessions and their native
push endpoints can be reviewed and revoked from Android settings. Password changes preserve the
initiating mobile session and revoke other native sessions.
