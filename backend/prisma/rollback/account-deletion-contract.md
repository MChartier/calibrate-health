# Dormant account deletion contract

Migration `0046_dormant_account_deletion` prepares cross-store deletion. It does
not select Firebase, install a provider adapter, or expose an endpoint or worker.
`AUTH_PROVIDER` must still be `local`. Only maintained tests construct
`AccountDeletionCoordinator` with an injected synthetic provider.
Knip excludes this one file only from its production graph; the ordinary graph
checks its test consumers, and a maintained test rejects production imports.

## State and transaction boundaries

1. `authenticate(userId, password)` requires an existing immutable mapping and
   matching provider authentication no older than 60 seconds. Its opaque proof
   belongs to that coordinator instance and carries the observed credential
   security version. Neither password nor provider credentials are persisted.
2. `begin(operationId, proof)` accepts a UUIDv4 operation identity. Under the User
   lock it rechecks the proof, mapping and version, then atomically records intent,
   revokes browser/native/MCP/Wear/recovery credentials, increments the security
   version and sets `deletion_pending`. A repeated identical request is idempotent;
   another operation or stale proof cannot replace the intent. Accepted intent
   cannot be cancelled automatically. Unmapped local accounts never enter it.
3. `resume(operationId)` claims a pending receipt with a monotonically increasing
   generation and a 60-second lease. Provider inspection/deletion happens outside
   SQL transactions, with a bounded timeout (default five seconds). Observations
   must match the entire user/installation/source/project/UID tuple. A timeout or
   lost response remains pending; identity mismatch returns `held`. Neither result
   changes the authority or removes SQL data. Reinspection handles a deletion that
   succeeded despite a lost response. An outage alone cannot create an intent.
4. Confirmed absence persists `provider_confirmed`. A fenced transaction then
   removes the SQL account and completes its independent receipt together. Crashes
   can replay the same operation; older claim generations cannot finalize it.
   Receipts reserve both the old user ID and provider project/UID after cascades.
   There is intentionally no receipt purge policy or production resumer here.

The adapter contract requires idempotent deletion of the exact immutable tuple;
it must never resolve an account by email or translate unavailability into
`absent`. Cancellation is advisory: a timed-out call may still finish, so a later
attempt must inspect before repeating deletion. A real adapter, authoritative
absence semantics and provider-side identity reuse controls require separate
review before activation.

Database guards cover older browser/native session, recovery, MCP, Wear and push
writers. Mapped-account writes serialize on User; a writer with an older lock
order can receive a PostgreSQL deadlock/transaction error and must retry from a
fresh transaction. Errors never authorize a fallback or restore pending access.
Unmapped local writers retain their previous lock ordering. Existing local
registration, reset, deletion and password-change current-session behavior remain
unchanged. No client cache, offline outbox, account/server identity or UI changes
are included. Runtime activation still needs its own client/recovery contract.

## Rollback and validation

`0046_dormant_account_deletion.sql` is a guarded schema rollback, not an operational
deployment command. It locks the affected tables and refuses **any** accepted
receipt or pending account, including completed receipts. With no accepted
operations it removes only this additive schema. It never erases intent to make
rollback succeed. Prisma migration metadata is not rewritten by this SQL; any
operational rollback/redeployment needs a separately reviewed migration plan.
Restoring an old backup after provider work is not established safe by these tests.

From `backend`, set `CALIBRATE_AUTH_TEST_DATABASE_URL` to a disposable loopback
PostgreSQL database named `calibrate_ci` or `calibrate_test...`, then run
`node -r ts-node/register --test test/account-deletion-postgres.test.js`.
The suite creates and removes only its uniquely named schema and synthetic
provider state. It tests real process termination, ambiguous provider outcomes,
transaction failure, lease takeover, both race orders, legacy lock conflicts,
populated schema rollback/re-upgrade and refusal to discard accepted receipts.
`npm test` also runs the ordinary browser/native/MCP/Wear/recovery regressions.
These checks establish a dormant synthetic contract, not a Firebase rehearsal or
permission to migrate, activate, import, deploy or change retention policy.
