# Issue 422 SQL checkpoint evidence

Owner: native implementation task 01a10fc4-f337-760c-9ad3-1b350f4f3027 on verified MCHARTIER_ZBOOK.
Retain this dedicated non-merged evidence ref for reviewer/QA access and historical provenance; it is never a product merge target. No credentials or live data.

Parent: PR423 / mchartier/firebase-migration-preparation at 75578e5ac57a05ba0f06146598b314a01eafb2ae.
Child: mchartier/bounded-sql-422 at 8d54fd6797944c46b64c4efde965b0c7f7d34306.
Ultimate target: master, observed remote 52bdc324fa2215e2d35e488a2bfaadd59cdca3ed.
Review/merge parent first. This child is only Scope3 SQL preparation; issue422 stays open.

## Behavior

`node observe.cjs <isolated-repository-path>` transpiles exact git-addressed Before and After resolver sources using the locked TypeScript installation. The baseline config follows the exact parent database.ts composition. observation.json records source hashes, synthetic fixture, runtime and actual results. It does not contact a database. Before ignores the opt-in numeric environment settings; After resolves max=3, acquisition=5000ms, idle=30000ms and equivalent CLI URL arguments.

The maintained tests at the child head cover runtime and actual Prisma config loading, invalid/boundary/duplicate/conflicting numbers, socket opt-in/conflicts, TCP defaults, escaping, schema selection and SSL preservation. The installed real pg pool uses synthetic EventEmitter clients: one held connection rejects a waiting acquisition after one second, release restores access, idle timeout removes the client, acquisition/idle errors free capacity, and disposal ends the one shared pool even when Prisma disconnect rejects. No UI flow changes, so this uses the non-UI observable-contract exception.

## Executed checks (2026-10-06 UTC)

From backend:

```
node -r ts-node/register --test test/database-utils.test.js test/database-pool.test.js test/postgres-session-store.test.js test/readiness.test.js
npm.cmd run typecheck
npm.cmd exec -- prisma validate
```

Observed: 36 tests passed, 0 failed/skipped/cancelled; backend typecheck passed; Prisma 7.9.0 generated successfully without live credentials; schema valid. `git diff --check` passed. Locked dependency install used `npm.cmd ci --prefer-offline --no-audit --fund=false`; no dependency/lockfile changes. No full mobile/UI suite is claimed because no client changes exist.

## Scope and boundaries

Full child range has three product commits and eight files (+468/-99): three configuration files, production image packaging for the shared CLI resolver, two maintained test files, one connection guide and one README link. Every file implements, protects or explains the admitted contract. No migration/generated contract change, source copy, temporary capture, log, fixture archive or operational record appears in product history. Auth/session revocation, User.id, Firebase identity, offline/backfill and parent/sibling sources are unchanged. This evidence was created separately, not added then deleted from product history.

Original evidence remains immutable at 47e83f1d6b26cbb5d39f6ce82f120758c625e1eb for original head3b2ccd7. The earlier packaging follow-up7892c7a only included the shared resolver in the production image; its evidence9ed5d2c and final receipt d2a7c3a remain historical. The initial container workflow37421705426 caught the missing imported file in startup; the existing production-image startup/readiness CI is the regression check. Current source includes the subsequent SSL correction below. Source observations were regenerated at the current head rather than relabeling original records.

## SSL boundary correction

QA verdict6010712958 was read in full and verified against exact UTF-8 SHA2560573754e2a44c2054d126735745e677fe9d8d27ee6b0501834d50a03f4519e71. It supersedes6010706581 only for a line-location correction; neither receipt is altered.

F1 input: explicit URL sslmode=verify-full with DB_SSLMODE empty and PGSSLMODE=verify-full. At assessed7892c7a runtime returned undefined SSL (pg inherited TLS), while CLI emitted disable. Current8d54fd67 rejects the blank override before opening either connection. Whitespace overrides, blank URL modes and blank component configuration also reject. Unknown modes and conflicting duplicate URL modes reject rather than falling through different driver defaults. Selected supported modes normalize case/whitespace identically; nonblank environment override precedence is preserved.

Maintained regression cases cover empty/space/tab/newline inputs, direct/component/socket boundaries, each of six supported explicit modes over each URL mode or absent URL mode, identical duplicates, and absent-mode defaults. Actual Prisma config subprocesses test all six explicit overrides plus empty/whitespace rejection with PGSSLMODE=verify-full. All36 affected tests, typecheck, Prisma generation/validation and diff hygiene passed locally after this correction. No actual TLS, cloud, database, credentials or system settings were changed. Pre-push impact/current bindings were published in6010773080. Fresh current-head CI and same-QA reassessment are required; previous positive CI is not adopted for new code.

No real TCP/socket database handshake, cloud/provider call, migration execution, infrastructure choice, production sizing, deployment or release is claimed. Prisma CLI URL/config parity is tested; live schema-engine transport/timeout behavior is not. Acquisition settings do not bound query execution. Idle timers cannot run while a process is suspended. Independent QA and current-head CI/review reconciliation remain separate gates, not certified by this implementation record.

Workflow acknowledged: workflow-v3 f0919b184b6344d6279178b2388190936ca432a9, pr-review-v3 97e5583c8355f3673aad0835c0ce3ca1486aeb8b and supplied direct amendments. Repository AGENTS, deployment configuration, admission6010258480 and 421/423 dependency handoff read. Host sandbox startup failed with deny-read ACL helper error; reviewed escalated host commands succeeded. No permission settings were changed. Cutoff remains 2026-10-17T15:53:00-07:00.
