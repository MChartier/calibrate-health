# Account access, verification, and recovery

Calibrate uses email verification and versioned legal acceptance as account-access gates. These
gates do not erase or fabricate account data: an authenticated session that needs action retains
access only to verification, legal, support, export, deletion, and logout flows.

## Account access contract

Every current server user payload includes:

```json
{
  "account_access": {
    "state": "full",
    "email_verified": true,
    "legal_current": true
  }
}
```

`state` is `full`, `email_verification_required`, or `legal_acceptance_required`. New clients treat
a missing `account_access` only as legacy self-host compatibility. The legal status endpoint also
returns current required versions and the user's latest accepted versions:

- `GET /api/v1/legal/status`
- `POST /api/v1/legal/acceptance` with both versions and explicit `accept_terms: true` and
  `accept_privacy: true` acknowledgements

Registration records explicit acceptance of the exact current versions. Existing users are
migration-marked email verified, but no legal acceptance is synthesized for them. They must accept
current Terms and Privacy documents before normal account access resumes.

## Email verification

- `POST /auth/email-verification/resend` accepts an optional email. A signed-in unverified session
  may omit it.
- `POST /auth/email-verification/confirm` consumes a single-use token.
- Verification tokens expire after 24 hours.

Resend returns the same HTTP 202 response whether the account exists, is already verified, or cannot
receive another message. This prevents account enumeration. A confirm failure uses
`INVALID_OR_EXPIRED_TOKEN` without revealing token storage details.

## Password recovery

- `POST /auth/password-reset/request` accepts an email and always returns a generic HTTP 202 response.
- `POST /auth/password-reset/confirm` accepts `token` and `new_password`.
- Reset tokens expire after 30 minutes.

A successful reset revokes every browser, Android, iOS, and Wear session. The user signs in again with
the replacement password. Token values and request bodies must never be included in logs, metrics,
exports, or support diagnostics.

## Hosted email configuration

The official hosted production/staging service sets:

- `CALIBRATE_HOSTED_SERVICE=true`
- `PUBLIC_APP_ORIGIN=https://calibratehealth.app`
- `EMAIL_DELIVERY_MODE=smtp`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM`

Hosted registration fails closed with `EMAIL_DELIVERY_UNAVAILABLE` when SMTP is incomplete or
unavailable. Self-host operators may leave `CALIBRATE_HOSTED_SERVICE=false` and
`EMAIL_DELIVERY_MODE=disabled`; in that mode the operator is responsible for deciding whether and
how to enable account email.

Keep SMTP credentials in the deployment secret store. `PUBLIC_APP_ORIGIN` must be one HTTPS origin
in production and is the only origin used to construct verification and reset links.

## Stable validation codes

- `INVALID_LEGAL_ACCEPTANCE`: registration did not include explicit acceptance.
- `INVALID_LEGAL_VERSION`: submitted Terms or Privacy versions are not current.
- `INVALID_OR_EXPIRED_TOKEN`: token is missing, expired, consumed, or bound to another purpose.
- `EMAIL_DELIVERY_UNAVAILABLE`: the hosted service cannot safely complete an email-dependent
  operation.
