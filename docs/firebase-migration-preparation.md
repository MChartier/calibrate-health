# Firebase existing-account migration preparation

This is additive preparation for [issue 421](https://github.com/MChartier/calibrate-health/issues/421).
It does **not** enable Firebase authentication or complete the migration. Existing
endpoints continue using local credentials and the current browser/native/Wear
session registry. An additive schema prepares identity links and a credential
security version. Existing user IDs, passwords, owned rows, legal history,
account exports, server selection and local-provider defaults are preserved.

## Additive SQL and local-provider foundation

Migration `0045_firebase_identity_foundation` adds an initially empty
`FirebaseIdentity` table. One row per User.id and a unique `(project_id, uid)`
constraint enforce one-to-one mapping. A trigger prevents changing the mapping
or deleting/replacing it while its account exists. SQL account deletion still
cascades to the mapping. This preserves local deletion behavior; it does not
implement future cross-store deletion or its durable tombstone workflow.
No migration creates a provider account, chooses a UID or links by email.
The row is preparation metadata, **not a switch of credential authority**.

`User.credential_security_version` starts at zero. A database trigger increments
it whenever the password hash changes, including writes from older local
application versions, and rejects decreasing versions. A future security bridge
can explicitly advance the version without changing a retained hash. MCP
approval locks the same account row against the version verified at password
check time; a concurrent version change prevents an old authentication result
from minting a code. Existing code/grant revocation remains in place. This
version alone does not revoke already-issued sessions or implement the external
event bridge.

`AUTH_PROVIDER` defaults to `local`. Any other value fails startup with an
actionable error; incidental Firebase environment variables never enable a
hosted identity pool. Firebase runtime activation is intentionally unavailable
until all lifecycle handlers and security reconciliation are integrated.
Apply migrations before running this binary. A rollback to the older local
binary remains compatible with this additive schema; the existing encrypted
backup/restore rehearsal checks the unchanged local-data contract. Once any
account changes provider authority, the stricter rollback boundary below applies.

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
- `withMigrationJournal` supplies a single-host append-only checkpoint store.
  It flushes each record with fsync before resolving `saveCheckpoint`, binds the
  manifest, and holds an exclusive lock file. It refuses a second importer,
  torn records, stale locks and state rewinds. A process crash retains the lock;
  never remove it automatically. Operator reconciliation must first establish
  that its owner and any outstanding remote requests are quiescent. This lock
  does not block database/Firebase writers or coordinate multiple hosts. Protect
  the directory with platform ACLs; POSIX mode 0600 alone does not establish
  Windows ACLs. Test and approve storage durability and backup on the intended
  operator filesystem before a real import; synthetic process-restart tests do
  not certify recovery after host power loss.
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

## External credential enforcement decision (not selected or enabled)

Recommendation for review: a **60-second hard cache expiry, fail closed after
expiry**, with uncached checks for new sessions and sensitive credential/grant
operations. This bounds external-revocation exposure while avoiding a network
lookup on every tracking request. It is a proposed tradeoff, not an implemented
default or authorization to activate Firebase.

| Option | External disable/delete/credential-change enforcement | Lookup and request latency | Already-signed-in sessions during Firebase outage |
| --- | --- | --- | --- |
| Every request, fail closed | Next server request after Firebase exposes the change; provider propagation and already-running requests remain limits | One lookup per authenticated request; every request waits for its round trip or timeout | Browser, native and Wear server access returns retryable unavailable immediately. Retain local session credentials so temporary outage does not force logout. |
| 60-second cache, hard expiry (proposed) | At most 60 seconds of cached allow after a successful check, plus provider propagation; expired state never authorizes | At most one refresh per active account per minute with shared/coalesced caching; cache misses wait for provider | Existing requests can use the remaining valid cache interval, then all three clients fail closed. No unbounded stale-while-revalidate. |
| 60-second cache plus 15-minute outage grace | Exposure can extend to 16 minutes since last success, plus provider propagation | Similar healthy lookup rate; bounded retries during outage | Previously signed-in users retain ordinary server access during grace. New/sensitive authorization stays closed. Higher revocation exposure; not recommended without explicit acceptance. |

Example only: 1,000 accounts each making six requests/minute for one hour imply
360,000 lookups with every-request checking versus about 60,000 with a coalesced
60-second cache, plus uncached sensitive operations. Independent instance caches
increase this count. No measured round-trip percentile or dollar saving is claimed;
benchmark the actual project/region before sizing. Identity Platform's email tier
is MAU-priced, so this is not a per-lookup price calculation; network waits still
consume application capacity/billed compute and API quota. See
[pricing](https://cloud.google.com/identity-platform/pricing) and
[request quotas](https://firebase.google.com/docs/auth/limits).

All options must check Calibrate's durable session/grant registry first on every
request. Local logout, remote-device revocation, revoke-others and refresh replay
must therefore reject subsequent requests immediately, independent of the provider
cache. Firebase user-wide revocation cannot replace that registry. Detected
external events must durably revoke applicable browser/native/Wear/push/pairing/MCP
access and advance the security version. None of these policies can erase offline
client caches or cancel a request that already completed authorization. The
external-state bridge, action-link lifecycle, timeout budget, clock handling and
reconciliation tests remain required before any policy can be enabled.

## Remaining stages and cutover gates

1. **Runtime authority integration:** use the prepared SQL mapping/version and
   introduce installation-owned Firebase opt-in only with complete lifecycle
   enforcement. No live authority switch belongs in schema deployment.
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
node -r ts-node/register --test test/firebase-migration.test.js test/credential-provider.test.js test/firebase-migration-cli.test.js test/migration-journal.test.js
```

These tests cover the observable offline CLI, byte-preserving payloads, timeout,
source drift, collisions, on-disk resume, abrupt-process lock retention, torn
records, partial failure, identity binding and local
compatibility. They do not exercise a real Firebase project, an emulator, a live
database migration, or changed app UI. Production cutover remains blocked on
the remaining stages above.

Primary contracts checked during preparation:
[Firebase import](https://firebase.google.com/docs/auth/admin/import-users),
[email/password REST](https://firebase.google.com/docs/reference/rest/auth#section-sign-in-email-password),
[session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions),
and [export limitations](https://firebase.google.com/docs/cli/auth).
