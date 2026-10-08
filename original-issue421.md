## Outcome

Move Calibrate’s email/password identity and credential lifecycle to Firebase Authentication while preserving every existing account, its password where supported, its application identity, its owned data and its access controls.

This is an actual existing-user migration. A new Firebase-backed registration flow alone does not complete it.

This issue scopes implementation, migration tooling, validation and an operator runbook. Creating it does not authorize provisioning, production account imports, live cutover, secret changes, deletion of retained credentials, deployment or release.

## Evidence from current code

Inspected authenticated GitHub source on 2026-10-05 at master `4728d4f75b70e6440a9778a42cd2224a300db725`, including the root AGENTS.md.

- [User schema](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/prisma/schema.prisma#L109-L189): integer `User.id`, unique email, required `password_hash`, verification timestamp, onboarding state and extensive user-owned relations
- [Registration and login](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/src/routes/auth.ts): bcryptjs cost 10; normalized email; separate browser and native entry points
- [Browser authentication](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/src/index.ts#L195-L277): Passport sessions backed by PostgreSQL, HttpOnly cookies, browser mutation-origin protection and integer user serialization
- [Native sessions](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/src/services/mobileSessionCredentials.ts) and [refresh/revocation](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/src/services/mobileAuth.ts): hashed opaque credentials, 15-minute access tokens, rotating 30-day refresh credentials, device identity and revocable sessions
- [Account-session management](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/src/services/accountSessions.ts): list/revoke individual browser, Android, iOS and Wear sessions; revoke other sessions without ending the current one
- [Recovery](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/src/services/accountTokens.ts), [password change/deletion](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/src/routes/user.ts#L204-L310) and [account lifecycle](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/src/services/accountLifecycle.ts) depend on local credentials and database cleanup
- [MCP OAuth approval](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/backend/src/services/mcpOAuth.ts#L200-L260) independently compares bcrypt and serializes approval against password changes through `password_hash`
- [Account-access contract](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/docs/account-access-and-recovery.md) preserves restricted recovery/export/deletion access. Existing verification was grandfathered by migration; legal acceptance was not fabricated
- [Client server selection](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/mobile/src/config/server.ts), [switching](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/mobile/src/auth/serverSwitch.ts) and [secure token storage](https://github.com/MChartier/calibrate-health/blob/4728d4f75b70e6440a9778a42cd2224a300db725/mobile/src/auth/storage.ts) support independently hosted servers

These are code findings, not evidence that every production row has the same hash format or that Firebase is already configured.

## Architecture decisions

1. Keep PostgreSQL and the existing integer `User.id` as the application/data-ownership identity. Add an immutable, uniquely constrained Firebase project/UID mapping. Do not replace primary keys, recreate user rows or rewrite health-record ownership.
2. Firebase becomes the credential authority for migrated accounts. Preserve Calibrate’s browser/native session contracts initially. This avoids coupling an account migration to a simultaneous rewrite of Wear pairing, device revocation and offline clients.
3. Prefer a backend authentication-provider adapter behind existing endpoints. Firebase’s documented [email/password REST sign-in](https://firebase.google.com/docs/reference/rest/auth#section-sign-in-email-password) permits this without forcing a native SDK rollout. Do not store or expose returned Firebase refresh credentials when only a Calibrate session is required.
4. If a client ID-token exchange is needed, verify the token with the Admin SDK against the configured project; never trust a submitted UID, email or decoded-only JWT. Require fresh authentication and prevent retained Firebase credentials from silently recreating a revoked device session. [Firebase ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
5. Preserve independent self-hosting. Hosted Firebase configuration must not silently enroll self-hosted users into the hosted identity pool. Keep an explicit local-provider compatibility mode for non-migrated installations, with documented opt-in migration to an installation-owned Firebase project. Firebase-backed accounts must never fall back to an obsolete local password.
6. Keep profile, health/tracking data, legal consent, app permissions and MCP authorization in PostgreSQL. Do not put health data in Firebase claims or broaden this into a Firestore migration.
7. Keep email/password as the provider scope. Social login, phone login, MFA and account merging are separate work.

Firebase project apps share an Authentication user pool; development, staging and production must be isolated. [Firebase project guidance](https://firebase.google.com/docs/projects/dev-workflows/general-best-practices)

## Existing-user migration

### Inventory and preflight

Build a read-only dry-run mode that reports sanitized counts and categories:

- Account count, existing IDs, email normalization/case collisions, invalid/missing identifiers, verification state and hash-format distribution
- Source-to-destination UID mapping and destination UID/email collisions
- Existing provider links, disabled/deleted-account state or historical exceptions if encountered
- Preservation checks for user-owned rows and application access state

Do not print or attach real emails, hashes, tokens or health records. Do not resolve collisions by choosing the first email match or merging accounts automatically.

Use deterministic, installation-scoped UID assignment or a persisted mapping generated before import. Enforce one-to-one mapping and prevent accidental cross-environment imports.

### Preferred password-preserving path

Use Firebase Admin BCRYPT import with the existing encoded hash supplied as bytes. Firebase documents support for BCRYPT without separate salt/cost options. The API accepts up to 1,000 users per call and can partially succeed. Critically, an existing UID is overwritten and duplicate emails can be created, so this API is not a safe blind upsert. [Firebase user import](https://firebase.google.com/docs/auth/admin/import-users)

Required tooling:

- Explicit source/destination identity checks and dry-run default
- Bounded batches, resumable progress, sanitized per-record outcomes and reconciliation
- Retry only proven-unimported records; never overwrite an already migrated account that may have changed its password
- Source-change detection or a bounded auth-write freeze during the approved final import/cutover
- Preservation of existing verified/unverified status without inventing verification or legal acceptance
- Synthetic bcryptjs fixtures covering observed formats, Unicode, supported length boundaries and incorrect passwords

Rehearse password import and real sign-in against an isolated Firebase test project; emulator success alone is not proof of production import compatibility.

Only introduce staged credential migration or a targeted reset path if inventory/rehearsal proves some existing credentials cannot be imported. Document affected cohorts and recovery behavior. Do not default to a blanket reset.

## Authentication and lifecycle integration

Route every credential-dependent flow through the new authority:

- Browser/native registration and sign-in
- Password change and current-password reauthentication
- Password recovery and email verification
- Account deletion
- MCP OAuth approval

Retain enumeration-safe errors, rate limits, cookie/CSRF protections and existing sanitized user payloads. Firebase/network failure must produce honest retryable behavior, not local-password fallback.

Registration spans Firebase and PostgreSQL and is no longer one database operation. Make duplicate submissions, provider timeout, database failure and email-delivery failure recoverable and idempotent. A valid Firebase identity alone must not automatically claim an existing local account by email or bypass explicit registration/legal consent.

Replace MCP’s `password_hash` concurrency guard with an appropriate credential/security-version invariant. Preserve its protection against approval racing with reset, password change or deletion, and preserve PKCE, resource binding, scopes and grant revocation.

### Sessions and security events

Firebase’s refresh-token revocation is user-wide; it does not replace Calibrate’s device/session registry. Firebase revocation also does not automatically destroy PostgreSQL/Passport sessions. [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions)

Preserve:

- Current-session logout, remote-session revocation and revoke-others behavior
- Native refresh rotation and replay protection
- Wear phone-issued pairing, origin/device binding and watch-only endpoint restrictions
- Push subscriptions’ session bindings
- Password change’s current-session behavior and revocation of other sessions/MCP grants
- Password reset’s revocation of all browser/native/Wear sessions, pending pairing credentials, push authorization and MCP grants

Implement an explicit, testable bridge for Firebase reset, disable, delete and credential-change events, including changes made outside Calibrate’s normal handler. Define the enforcement latency and outage behavior before cutover; do not assume Firebase emits a complete password-change webhook.

### Verification, recovery and legal gates

Firebase should own new verification/reset credentials. Keep the existing generic responses, safe application landing pages and account-access gates. Its [Admin email action links](https://firebase.google.com/docs/auth/admin/email-action-links) can integrate with the existing email-delivery channel.

Handle already-issued legacy links deliberately: bounded drain or safe replacement guidance, with no resurrection of local credentials after cutover. Preserve verified timestamps/history and genuine legal acceptance records. Restricted accounts must still reach allowed recovery, export, deletion and logout flows.

### Deletion

Replace bcrypt reauthentication with Firebase-backed recent authentication. Coordinate Firebase identity deletion, SQL cascades, session/grant revocation and existing client cleanup through a durable, retryable workflow.

Fail closed while deletion is pending. Reconcile partial failures without restoring access or recreating a deleted account. Do not claim full deletion while either side remains live. Do not depend solely on Firebase deletion callbacks; bulk deletion does not trigger individual `onDelete` handlers. [Firebase Admin user management](https://firebase.google.com/docs/auth/admin/manage-users)

## Rollout and rollback

1. Ship additive schema/provider support with existing behavior unchanged.
2. Complete inventory, collision handling, synthetic import rehearsal and cross-store failure testing.
3. Prepare reviewed backup/recovery, migration manifest and operational metrics.
4. Perform only separately authorized import and staged cutover, with a single authoritative credential provider per migrated account.
5. Verify all intended identities are mapped, user-owned data is unchanged, authentication succeeds and revocation/recovery/deletion behave correctly.
6. Retire the legacy credential path and retained hashes only after the agreed rollback window and explicit operational approval.

Rollback must distinguish reverting application code from reverting credential authority. Once Firebase changes a password, the old bcrypt hash may be stale; restoring it can re-enable an invalidated password. Firebase export also does not export untouched imported non-scrypt password hashes, so it is not a complete replacement backup. [Firebase export limitations](https://firebase.google.com/docs/cli/auth)

Prefer rollback to a compatible application version that still uses Firebase for migrated accounts. Test rollback after signup, reset, password change and deletion; do not restore a database snapshot over newer health records.

## Client and GCP dependencies

- Preserve existing Web/PWA, Android, Wear and current iOS code paths without expanding iOS launch scope. Keep account/server-scoped caches, offline outboxes, onboarding and Health Connect cleanup intact.
- Prefer additive API compatibility; update OpenAPI/generated clients where necessary. If an older client cannot safely continue, use the existing explicit minimum-version/compatibility mechanism before retiring its path.
- Coordinate with the GCP preparation issue for explicit Firebase project/auth-mode configuration, Cloud Run application-default/workload credentials, least-privilege runtime access, outbound timeouts, stable session secrets, PostgreSQL connection budgets and canonical HTTPS email-action origins.
- No service-account private keys in images or client bundles. No mandatory Firestore, Redis or always-on worker introduced solely for this migration.
- Durable email/deletion/reconciliation work must survive instance termination and scale-to-zero; do not rely on an in-process callback after returning HTTP success.
- Update privacy/account-deletion disclosures for the actual identity processor and data sent. Do not include health data in migration payloads.

## Acceptance and validation

Requirements for later implementation; none are claimed executed during scoping:

- [ ] Every source account is accounted for as successfully mapped or explicitly held for resolution; zero silent drops, automatic merges or overwritten destination identities
- [ ] Imported synthetic existing accounts sign in with unchanged passwords and retain the same User.id, owned records, verification state, onboarding and legal history
- [ ] Rerunning/resuming migration cannot overwrite a password changed after import
- [ ] Browser, Android and Wear login/restore/logout/refresh/revocation flows work; existing iOS code remains compatible
- [ ] Wrong-project identities, forged/stale credentials, unmapped identities, duplicate signup and email collisions cannot claim another account
- [ ] Password change/reset, external disable/delete and MCP approval races enforce the documented security boundary across both stores
- [ ] Verification/recovery links, expired/used links, restricted-account access and legacy-link transition are covered
- [ ] Cross-store signup/deletion failures converge safely under retry, restart and provider outage
- [ ] Existing exports remain complete and credential-free; no cross-account/server cache, offline replay or Health Connect leakage
- [ ] Rollback is rehearsed after credential changes and deletion without restoring stale passwords or losing later user data
- [ ] Backend/API/client tests, typechecks, relevant builds, migration upgrade/rollback checks and actual browser/device behavior are reported against exact revisions, using synthetic data
- [ ] Operator runbook specifies cutover criteria, stop conditions, rollback boundary, reconciliation, retained-credential handling and separately authorized production steps

Recheck current code and overlapping ownership before implementation. Follow the current coordination/review standard; this scoping issue does not itself dispatch an implementation or authorize a merge.
