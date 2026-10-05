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

## Offline-first authorization and recovery

The user's 2026-10-05 correction supersedes the earlier hard-expiry proposal:
temporary network or authentication-provider outages must not sign people out,
lock their local workspace, discard credentials, or delete cached/pending data.
Previously signed-in people must be able to continue tracking locally, including
after restart, with visible pending-reconnection/sync status.

Local continuity and server authorization are separate contracts:

- Persist the last server-verified local identity and tracking cache scoped by
  exact server origin and user ID. A cached identity opens only that local
  workspace; it is never a server credential or proof of current authorization.
- Queue local writes durably with stable operation IDs. Preserve FIFO order and
  uncertain commits across process restart; replay only to the original account
  and server after authorization succeeds. Never transfer queued data on login
  or server switch. Explicit logout/deletion retains its established cleanup.
- Treat network loss, timeout, provider unavailability, 429 and retryable 5xx as
  pending reconnection, not revocation. Retain tokens and local content. Retry
  with bounded exponential backoff, pause while offline/backgrounded, and retry
  on reconnect/foreground or explicit retry. Do not require a provider round
  trip for local editing or expire local access on a timer.
- Server reads/writes and sync still enforce durable Calibrate session/grant
  revocation and account isolation on every request. A provider outage returns
  retryable unavailable when authorization cannot be established; it never
  authorizes otherwise unauthorized server writes. Do not return 401 for an
  infrastructure outage or clear a valid client session as a side effect.
- An actually confirmed revoked, disabled or deleted identity is terminal for
  server authorization. Stop replay and require explicit valid reauthentication
  where permitted; never silently restore a revoked session from cached state.
  Preserve unsynced content without exposing it to a different account. Cached
  state cannot reverse a confirmed deletion or an explicit local logout.

For the eventual Firebase server bridge, ordinary requests may share/coalesce
successful external-state checks for up to 60 seconds; fresh sessions and
sensitive operations require a fresh check. This bounds server-side stale allow
without placing any expiry on local tracking. After an expired check fails,
server sync pauses with retryable unavailable while local work continues. Local
SQL revocations take effect on the next request independently of that cache.
The cache is a proposed server implementation bound, not permission to activate
Firebase, extend revoked credentials or select outage-grace server access.
Provider propagation and already-authorized in-flight requests remain limits.

Validation must distinguish auth-service outage from network loss and confirmed
revocation, cover restart with cached identity and pending writes, successful
same-account reconnection, mismatched-account rejection, and local/server logout
boundaries. UI changes require genuine matched Before/After evidence. No real
Firebase rehearsal or runtime activation is implied by synthetic tests.

## Implemented local continuity checkpoint

Browser and native startup can restore the last verified identity and an
allowlisted tracking-query snapshot for the same server origin after a transient
failure. Native restoration also requires the retained refresh credential.
Snapshots are local workspace state, never server authorization; an explicit
logout or confirmed rejection removes the restorable identity. Existing queued
writes retain their server/user namespace and stable operation ID.

Outbox-backed food, weight and day-status mutations run even when React Query
knows the device is offline and enqueue before attempting network I/O. Other
server-only mutations retain their normal network behavior. Cached data is
limited to resources previously loaded on that device: remote food search,
uncached history and account/security operations still need a connection.
The saved-changes sheet reads durable outbox entries directly, so queued weights,
food additions/edits/deletions and day changes can be reviewed after restart.
Tracking views overlay ordered durable intent onto cached server rows. Local food
and weight additions, edits and deletions are visible immediately and after
restart; food totals use entry snapshots, while server-owned trends/targets wait
for synchronization. Synthetic negative IDs are local only. Dependent edits and
deletions preserve the immutable original creation request and operation ID;
replay recovers the existing server idempotency receipt before addressing the
real row. Receipt conflicts reject the dependent write rather than guessing or
changing the original create. This relies on the current server's retained
account/operation receipts; it does not enable compatibility with servers that
lack that contract. Acknowledged rows are snapshotted before intent is dequeued,
so partial replay and restart retain visible results. Query refetch waits while
related intent is pending; receipt metadata prevents duplicate local rows.
Legacy queued saved-food requests without a nutrition snapshot remain visible in
the saved-changes sheet until synchronization; no zero-calorie value is invented.
Successful cold authentication hydrates only the verified same-account cache
before replacement, and partially loaded snapshots retain prior tracked queries.
Account/server generation checks guard asynchronous hydration and replay.
The pending-reconnection notice retries on foreground/reconnect, offers manual
retry and uses a 5-second exponential delay capped at 60 seconds. Existing outbox
replay retains its own bounded retry policy. A recovered account mismatch stops
replay instead of sending the old account's data under the new session.

Queued additions and corrections are projected into the tracking views without
persisting synthetic IDs as server rows. Active food holds are date-scoped;
failed writes remain reviewable without blocking unrelated query refreshes.
Day-status changes queue behind existing writes. Every producer reads the durable
outbox under an account/server dispatch lock before deciding to execute directly.
Browser Web Locks serialize tabs; without them, writes always enter the durable
queue. Native dispatches serialize within the application runtime. A stale React
snapshot cannot let day completion overtake another tab's queued food. A new
enqueue requests eligible replay without waiting for a separate lifecycle event;
unchanged deferred work retains its existing backoff. Failed food creations, updates and deletions
must be retried or explicitly discarded before a correction or deletion is accepted. The
entry's discard confirmation removes only that entry's queued food changes,
atomically within its account/server namespace; it does not delete a server
record or silently replace an ambiguous request with a new operation ID.

Retry preserves the exact original operation ID and payload. Confirmed discard is
an explicit abandonment of the selected entry's queued edits/deletion, not rollback
of work that may have reached the server. It keeps other entries, dates and account
namespaces, rejects stale confirmation after retry starts, and is transactional on
both stores. Existing server entries remain editable after recovery; optimistic
entries use their immutable creation reference rather than a synthetic numeric ID.
A queued deletion behind a failed edit leaves the entry visible for recovery. The
editor blocks Save and redirects Delete into recovery while that entry has a failed
intent. Unrelated offline writes remain durable behind the existing ordered queue
barrier and are visibly pending; recovery does not reorder them or silently replay
a changed request. All ten supported mutation kinds share an insertion-time failure guard in the same
SQLite/IndexedDB transaction as enqueue. A related correction is rejected before
acknowledgement while its earlier request is failed. Unrelated local work remains
durable and visibly blocked behind the ordered failure barrier; the notice does not
promise reconnection alone will repair a nonretryable request.

Weight upserts and deletions recover by calendar day, including optimistic records.
New queued deletions retain their date. A legacy deletion without a known date
conservatively blocks weight corrections until recovery, but scoped discard never
removes unrelated dated records. Failed weight edits/deletions keep the entry visible
and expose retry or explicit discard in the weight sheet.

The shared saved-changes sheet provides original-request retry and a confirmation
listing the exact related intent for every failed kind. Food recovery groups one
entry; weight recovery groups one day; tracking-day and pause/resume requests are
reviewed together because a pause can span multiple days. Control discard explicitly
lists all affected queued controls and preserves food/weight records. Transactions
reject stale recovery after retry or active replay. Successful scoped discard starts
reconciliation immediately, so remaining eligible intent does not wait for another
foreground/reload event; network failures retain the usual bounded retry behavior. Neither retry nor discard
silently rewrites an ambiguous request or claims to undo server changes.

Maintained client tests cover startup network/auth outages, confirmed rejection,
account/server isolation, durable outbox restart and true-offline weigh-in intent.
The exported-web test in e2e/expo-web/offline-workspace.spec.ts exercises actual
UI outage/reload, queued weight, restart, authenticated replay and network loss
using synthetic API fixtures. These do not certify Firebase or physical devices.

Explicit logout remains available while local tracking awaits reconnection. It
persists a per-server signed-out marker before clearing the current local session;
startup never restores that account automatically while the marker exists. Server
revocation bypasses the tracking request gate and retries on reconnect, foreground
or startup. A new explicit login or registration first completes pending revocation.
Browser storage contains only logout state, never the HttpOnly session credential.
Native pending refresh credentials stay in SecureStore until acknowledged revocation;
late refresh responses are revoked instead of restoring a signed-out session.
Serialized token storage prevents an older write from restoring cleared credentials.
Unrelated local data and account/server-scoped queued tracking changes are retained.
An outage alone continues to preserve verified local access; explicit logout does not.

The logout regressions cover offline logout/restart/reconnection, retained queued
tracking, replacement-account login and late native refresh responses. Browser account
switching requires an HTTPS preview, matching the production credential transport rule.
Native checks are component/storage tests, not emulator or physical-device evidence.

If persisting explicit sign-out fails, local cleanup and server revocation are
still attempted independently. In-process intent retains the active native token
in memory (never browser credential storage) and retries while the app remains
open. An unreadable durable record is not overwritten. If storage and networking
both fail, the UI states the restart limitation and asks the user to reconnect
before closing; no durable sign-out guarantee is claimed in that state.

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
