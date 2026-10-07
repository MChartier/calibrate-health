# PR402 recovery plan

Native users need an explicit, tested and cancelable service choice; self-hosted operators need durable in-app administration and recovery. Retain PR402's useful behavior while preserving master's newer offline/session work. Hosted defaults and browser-origin binding already exist.

## Focused successor

Start a new isolated branch from the reverified actual master (assessed at 4cbcbc740fbe5fa5646b4de31951c79a653176d5). Selectively port product changes, maintained tests, required migrations/generated contracts and maintained operator/design documentation. Do not merge or import PR431/437. Retain PR402 and these evidence refs until the coordinator verifies a linked replacement covers the intended work and all dependencies; no replacement or closure is performed by this preparation. Appending artifact deletion to PR402 would leave capture churn in its four published commits.

Exclude the sixteen historical gallery/archive paths, ad-hoc self-hosting capture harness and capture-only CI delta from successor product history. Preserve useful assertions as maintained tests; retain recovery CLI Knip discovery and its regression. The complete ordered commit/file inventory is [retained here](published-scope-inventory.json).

## Required source correction

[Directory-lock P2](https://github.com/MChartier/calibrate-health/pull/402#discussion_r4174731711) is source-confirmed: listServerUsers holds the singleton ServerAccessState FOR UPDATE lock while scanning email substrings. Separate directory reads from that exclusive ownership lock while retaining fresh verified-admin authorization. This is a contention mechanism, not a reproduced production incident. Retain atomic bootstrap, legacy import and last-admin mutation guards.

## Seven conflict resolutions

- mobile/src/auth/AuthContext.tsx and AuthContext.test.tsx: reconcile epoch/stale-callback protection with current offline workspace hydration, explicit logout and queued refresh-token revocation.
- mobile/src/auth/AuthContext.web.tsx and AuthContext.web.test.tsx: preserve offline restoration, logout intent and cache cleanup while preventing stale authorization responses from affecting newer sessions.
- packages/api-client/src/client.ts: integrate abort checks into the current request/requestInternal error-observer structure; cancellations must not replay mutations or affect another session.
- scripts/postgres-rollback-smoke.mjs and scripts/postgres-rollback-smoke.test.mjs: recompute the combined ledger and preserve current schema assertions. Retaining the published 0042 migration yields 49 migrations with 0045 still the last ordinal; do not restore obsolete 46/0042 terminal pins or silently rename an applied migration.

## Ownership and dependency contract

Original cloud owner /root/improve_self_hosting_experience explicitly handed off idle with no child writers. [Exact original handoff](https://github.com/MChartier/agentic-development-workflow/blob/e7c61c50d8be01437c15e0c3cfcd3fa683e81571/runtime-next-scope/pr402-owner-handoff.json). Proposed native continuation task: 01a1145f-aae2-70e0-af56-3952f0eab012; implementation has not started and coordinator admission/assignment remains required.

Issue421 owner 01a10cfe-a79f-7198-9e8f-2b4dc6703031 confirmed no overlooked dependency and remains idle. PR431 b3d6559ad8abd1c2725c509357302b1f0e12cdd2 and child437 a0fdefe8bca51c25306f36cccc8181bd35672341 are unchanged. Shared backend auth imports and routes-auth-mobile test loading must preserve verifyLocalPassword, issueVerifiedMobileAuthPayload, credential-version/transaction fixtures and restricted recovery sessions alongside402 serverAccess stubs. Also coordinate shared index/user/recovery-route test loaders. Recheck actual merge order before integration; do not change their branches.

## Validation and evidence gates

- Real disposable PostgreSQL, separate connections: simultaneous first registration yields one owner; managed mode never claims ownership; demotion/deletion retains a verified admin; directory reads do not block ownership writes or serialize each other; revoked/unverified actors receive no administrative data. Existing fake-database tests do not establish PostgreSQL locking.
- Fresh/populated upgrade, one-time strict-ID import, nonexistent IDs, failed first-owner email delivery, verification cleanup races and explicit verified-account recovery. Update and run the populated upgrade/rollback contract.
- Native chooser success/failure/cancel, credential/consent clearing, password recovery destination, browser same-origin behavior, unsynced-outbox switch blocking, late401/403/refresh/abort responses and admin-cache isolation. Preserve current offline/revocation and useful API/UI tests.
- Applicable current-head typechecks, generated-contract determinism, maintained tests and CI; configured review findings resolved. Bot quota refusal alone is not a blocker, but independent review is mandatory.
- Genuine matched actual-base-to-final captures for representative service/admin states and the native chooser, using synthetic fixtures. Inspect pixels and exact source/build/fixture/harness/provenance independently. The old corpus is After-only phone/desktop web capture, not a Before/After comparison and not native evidence. PWA notice suppression by hideTransientPwaNotices is disclosed. Record the human PR-page-rendering waiver; do not claim a rendering check passed.
- Independent QA must inspect complete published commit/file scope and concise issue/final PR presentation, all current conversation/review/inline feedback, then return an append-only verdict and exact API-readback digest for coordinator receipts and pre/post-readiness checks.

No product port, new PR, source rewrite, closure, tests/builds, provider/credential/security change, deployment or release occurs in this preparation.
