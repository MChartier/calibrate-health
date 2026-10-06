# Issue 422 SQL checkpoint evidence

Owner: native implementation task 01a10fc4-f337-760c-9ad3-1b350f4f3027 on verified MCHARTIER_ZBOOK.
Retain this dedicated non-merged evidence ref for reviewer/QA access and historical provenance; it is never a product merge target. No credentials or live data.

Parent: PR423 / mchartier/firebase-migration-preparation at 75578e5ac57a05ba0f06146598b314a01eafb2ae.
Child: mchartier/bounded-sql-422 at 7892c7a8193c5e64c37e92a06e3e0fd360de9a43.
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

Observed: 34 tests passed, 0 failed/skipped/cancelled; backend typecheck passed; Prisma 7.9.0 generated successfully without live credentials; schema valid. `git diff --check` passed. Locked dependency install used `npm.cmd ci --prefer-offline --no-audit --fund=false`; no dependency/lockfile changes. No full mobile/UI suite is claimed because no client changes exist.

## Scope and boundaries

Full child range has two product commits and eight files (+390/-86): three configuration files, production image packaging for the shared CLI resolver, two maintained test files, one connection guide and one README link. Every file implements, protects or explains the admitted contract. No migration/generated contract change, source copy, temporary capture, log, fixture archive or operational record appears in product history. Auth/session revocation, User.id, Firebase identity, offline/backfill and parent/sibling sources are unchanged. This evidence was created separately, not added then deleted from product history.

Original evidence remains immutable at 47e83f1d6b26cbb5d39f6ce82f120758c625e1eb for original head3b2ccd7. Current configuration/tests are byte-identical; the follow-up only includes the shared resolver in the production image. The initial container workflow37421705426 caught the missing imported file in startup; Dockerfile packaging fixes that concrete failure. The existing production-image startup/readiness CI is the regression check. Source observations were regenerated at the final head rather than relabeling the original record. Initial/current publication readbacks retain separate identities.

No real TCP/socket database handshake, cloud/provider call, migration execution, infrastructure choice, production sizing, deployment or release is claimed. Prisma CLI URL/config parity is tested; live schema-engine transport/timeout behavior is not. Acquisition settings do not bound query execution. Idle timers cannot run while a process is suspended. Independent QA and current-head CI/review reconciliation remain separate gates, not certified by this implementation record.

Workflow acknowledged: workflow-v3 f0919b184b6344d6279178b2388190936ca432a9, pr-review-v3 97e5583c8355f3673aad0835c0ce3ca1486aeb8b and supplied direct amendments. Repository AGENTS, deployment configuration, admission6010258480 and 421/423 dependency handoff read. Host sandbox startup failed with deny-read ACL helper error; reviewed escalated host commands succeeded. No permission settings were changed. Cutoff remains 2026-10-17T15:53:00-07:00.
