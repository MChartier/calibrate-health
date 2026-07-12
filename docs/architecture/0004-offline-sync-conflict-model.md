# ADR 0004: Use durable operation identity and authoritative refresh for offline sync

- Status: Accepted
- Date: 2026-07-12

## Context

Phone and watch writes can lose their response after the server commits, and either process can restart while work
is queued. Retrying a create or delete without a stable identity can duplicate or repeat the domain change. The watch
also exposes weight and day-completion actions from cached state, so a later write from another client can make that
cache stale.

## Decision

Assign one opaque operation ID before the first mutation attempt and reuse it for every replay. The phone persists
retryable uncertain writes in a SQLite FIFO scoped by server origin and user. A terminal failure is a queue barrier
until explicitly retried. The watch persists a FIFO Room outbox and drains it through one network-constrained
WorkManager chain; account-scope checks prevent a re-pair from committing work into another account.

On the server, claim operation IDs per user. Hash the operation kind and canonical request, then commit the operation
claim, domain write, ordered `SyncChange`, and original wire response in one transaction. An identical retry returns
the stored response. Reusing an ID for different input is a conflict, and a still-in-progress claim is retryable.
Expose the per-user change feed through ordered string cursors for resumable reconciliation.

Watch mutations that can overwrite current weight or food-day state include the entity revision from the cached
snapshot. A stale revision returns a conflict instead of applying last-write-wins. After a watch mutation succeeds,
keep it in `awaiting_snapshot` until an authoritative conditional snapshot refresh commits; only that refresh unlocks
the action and updates the cache. Snapshot cursors are stored after the replacement cache is committed so a crash
cannot validate a partially written cache with a 304 response.

## Consequences

- Network retries are at-least-once transport with effectively-once domain effects for a retained operation receipt.
- FIFO ordering preserves user intent across restarts; one failed head can delay later phone mutations.
- The sync feed is an invalidation/reconciliation log, not a second writable source of truth.
- Stale watch edits are visible failures requiring refresh or user action; they do not silently overwrite newer data.
- Operation receipts and sync changes are durable database data and require an explicit retention policy before any
  pruning is introduced.
