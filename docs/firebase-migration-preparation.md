# Firebase existing-account migration preparation

This is the first, offline preparation stage of [issue 421](https://github.com/MChartier/calibrate-health/issues/421).
It does **not** enable Firebase authentication or complete the migration. Existing
endpoints continue using local credentials and the current browser/native/Wear
session registry. No database schema, user IDs, owned rows, legal history, account
exports, server-selection behavior, or deployment defaults change in this stage.

## Offline inventory

From `backend/`, after repository dependency setup:

```text
node -r ts-node/register scripts/firebase-migration-plan.js --help
node -r ts-node/register scripts/firebase-migration-plan.js <inventory.json>
```

The command accepts an operator-supplied JSON inventory and writes a sanitized
plan to stdout. It has no database connection, Firebase client, credential lookup,
or apply option. Exit 0 means all input rows passed **offline** checks, 2 means
one or more rows are held for resolution, and 1 means the input could not be read
or validated. None of these results establishes migration or cutover readiness.

Input shape (placeholders below are intentionally not a valid inventory):

```json
{
  "scope": {
    "installationId": "stable-installation-id",
    "sourceId": "stable-source-database-id",
    "projectId": "installation-owned-project-id"
  },
  "accounts": [{
    "id": 123,
    "email": "synthetic@example.invalid",
    "passwordHash": "<complete encoded bcrypt hash>",
    "emailVerified": false,
    "preservationDigest": "<64 lowercase hex characters>",
    "providerLinked": false,
    "disabled": false
  }],
  "destination": [{ "uid": "existing-uid", "email": "other@example.invalid" }]
}
```

Use separately authorized, installation-specific acquisition for real inventories.
No live acquisition is implemented here. The destination input must enumerate
all identities, including identities without email; an empty list means the
operator supplied an empty snapshot, not that Firebase was inspected. Inventories
contain credentials and must remain in protected operator storage, never Git,
PR attachments, or ordinary logs. This task's tests use synthetic data only.

`preservationDigest` must bind the canonical ownership/access snapshot collected
by the future source adapter: owned-row identities and content, verification
timestamp/history, onboarding state, and genuine legal acceptances. The planner
only checks its format and detects changes; it cannot establish completeness or
preservation from a digest supplied by a caller. A live adapter and independent
before/after SQL reconciliation are still required.

Scope IDs are stable non-secret names, not connection strings. Deterministic
UIDs include the installation, source, destination project and integer User.id.
Changing any scope yields different UIDs and requires a new reviewed manifest.
Keep environments in separate Firebase projects. Never match or merge accounts
by email. Case/normalization collisions hold **every** affected source account.
Destination UID or email collisions, existing links, disabled accounts, invalid
IDs/state and unsupported hashes also hold the affected rows. Resolve them
explicitly before preparing a new plan; do not select the first matching row.

Plans retain original input ordinals, valid application IDs, deterministic UIDs,
source fingerprints, hold categories and aggregate counts. They contain no
emails, hashes, tokens or health records. The source fingerprint includes the
encoded salted password hash but does not expose it. Treat the plan as private
operational metadata. Its digest detects accidental changes; it is not a
signature or authorization boundary.

## Import engine contract

`backend/scripts/lib/firebaseMigration.ts` supplies a testable, dry-run-default
engine for future operator tooling. **No live apply adapter is shipped.** The
injected source, destination and checkpoint store are trusted operator components,
not an HTTP API. Tests substitute a synthetic destination; they do not claim
Firebase behavior or database durability.

- Pin the exact plan and source order. Validate source/destination identity using
  independently trusted connection metadata, not just names supplied in JSON.
- Hold an exclusive source auth-write freeze and destination identity-write freeze
  across inspection, import, reconciliation and final authorization. Serialize
  importer processes too. The engine itself does not acquire these freezes.
  A collision precheck alone has a race: Firebase import has no create-only
  precondition and can overwrite a UID or duplicate an email.
- Supply a durable checkpoint store that atomically persists and flushes each
  update before resolving `saveCheckpoint`. It must bind the manifest and prevent
  concurrent writers. An in-memory callback is only suitable for tests.
- Batches default to 100 and cannot exceed 1,000. Send only UID, normalized email,
  original verification boolean and UTF-8 bytes of the complete encoded bcrypt
  hash, with `{ hash: { algorithm: 'BCRYPT' } }`. No separate salt/cost options,
  health data, application permissions or legal claims are sent.
- Before each batch, recheck source fingerprints and destination UID/email
  absence. Persist `in_flight` before import. Persist indexed outcomes after a
  validated response. Resume skips `imported` records, protecting passwords
  changed at the destination after import. It continues untouched `pending` rows.
- Any timeout, lost response, crash with `in_flight`, malformed result, persistence
  failure or partial result stops the run. `rejected` and `in_flight` records are
  never automatically retried. Do not reset their states to `pending` manually.
  Recovery tooling must first quiesce outstanding writes, obtain authoritative
  per-record evidence and prove a record was never imported before retrying it.
  Mere absence immediately after timeout is insufficient. Recovery tooling remains
  a later stage; keep the original checkpoint and receipts intact.
- A successful import is not a SQL identity mapping or credential cutover. A
  future transaction must install a uniquely constrained immutable project/UID
  mapping against the unchanged User.id. Retain the local hash under the agreed
  rollback policy without permitting fallback after authority changes.

The engine refuses a plan with any held account. This makes resolution explicit;
an operator must not silently omit difficult accounts to produce a green plan.

## Provider adapter preparation

`backend/scripts/lib/credentialProvider.ts` is isolated from server startup. Its
local branch uses bcrypt; its Firebase branch uses email/password REST sign-in,
then requires a verifier bound to the expected project/UID and recent `auth_time`.
The future verifier must call Admin SDK `verifyIdToken(token, true)` against the
explicit installation project. There is no decode-only token path or local
password fallback. Responses expose only success/failure, discard returned
Firebase tokens, and bound provider/verification waits. Network, rate-limit and
configuration failures are sanitized retryable provider failures.

This adapter does not authorize an app session. Before using it in endpoints,
the runtime must atomically enforce the mapped identity, account-access state,
credential/security version and pending deletion state. A valid provider identity
must never claim an existing SQL account by email. Registration still needs an
explicit, idempotent cross-store workflow and genuine legal consent.

## Remaining stages and cutover gates

1. **Additive SQL/runtime foundation:** unique immutable project/UID mapping,
   security-version invariant, explicit local defaults and installation-owned
   Firebase opt-in. Coordinate schema/lifecycle overlap with existing owners
   before integrating. No live authority switch belongs in schema deployment.
2. **Complete lifecycle:** route registration/login, current-password checks,
   recovery, verification, deletion and MCP approval through the same authority.
   Serialize MCP approval against credential/security changes. Preserve PKCE,
   scopes, resource binding and grant revocation. Handle duplicate signup,
   provider timeout, SQL failure and email failure durably.
3. **Security bridge:** implement external reset/disable/delete/change detection
   and durable reconciliation. Decide and test maximum enforcement latency and
   outage behavior explicitly before cutover. Do not assume complete password
   change webhooks or that Firebase user-wide revocation destroys SQL sessions.
   Reset must revoke browser/native/Wear sessions, pending pairing, push access
   and MCP grants. Change must retain the intended current session while revoking
   others. Preserve per-device revoke/logout/refresh replay protection.
4. **Recovery/deletion:** Firebase owns new action credentials. Specify bounded
   legacy-link draining/replacement without resurrecting local credentials.
   Restricted accounts retain recovery/export/deletion/logout. Deletion must
   fail closed while pending and retry across both stores without returning
   success while either identity remains live. Persist work before responding;
   do not rely on process callbacks or individual Firebase deletion hooks.
5. **Rehearsal and release decision:** authorize an existing isolated test project
   separately. Import synthetic bcryptjs fixtures ($2a$/$2b$/$2y$, Unicode,
   72-byte boundary and wrong passwords) and perform real REST sign-in. Emulator
   or local bcrypt success does not establish import compatibility. Rehearse
   cross-store failures, preservation queries, migration upgrade/rollback,
   session/MCP/Wear behavior, older clients and external security events. Update
   privacy/deletion disclosures for the actual processor before enabling it.

Every source account must remain accounted for, mapped or explicitly held. Stop
on any identity mismatch, collision, unknown outcome, source drift, unexplained
ownership/access change, failed revocation or inaccessible recovery path. Review
backup/restore, metrics, stop conditions, the final manifest and credential
retention window before separately authorizing import/cutover. No provisioning,
production import, credential change, deployment or release is authorized here.

Rollback after signup/reset/password change/deletion must keep Firebase authority
for migrated accounts. Reverting to stale local hashes can reactivate invalidated
passwords. Do not restore an old SQL snapshot over newer health records. Firebase
export does not provide untouched imported non-scrypt hashes as a complete backup.

GCP issue 422 must build on the completed Firebase runtime foundation, not infer
readiness from this offline stage. Runtime credentials should use ADC/workload
identity; keep keys out of images/clients, canonical HTTPS action origins explicit,
and durable work compatible with scale-to-zero. No new always-on service is
required by this preparation tooling.

## Validation and references

Run synthetic preparation tests from `backend/`:

```text
node -r ts-node/register --test test/firebase-migration.test.js test/credential-provider.test.js test/firebase-migration-cli.test.js
```

These tests cover the observable offline CLI, byte-preserving payloads, timeout,
source drift, collisions, resume, partial failure, identity binding and local
compatibility. They do not exercise a real Firebase project, an emulator, a live
database migration, or changed app UI. Production cutover remains blocked on
the remaining stages above.

Primary contracts checked during preparation:
[Firebase import](https://firebase.google.com/docs/auth/admin/import-users),
[email/password REST](https://firebase.google.com/docs/reference/rest/auth#section-sign-in-email-password),
[session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions),
and [export limitations](https://firebase.google.com/docs/cli/auth).
