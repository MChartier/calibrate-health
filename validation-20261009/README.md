# Dormant deletion: current-master ordering assessment

This retained experiment checks whether the dormant deletion protocol remains transactionally safe alongside the weight/goal locking now on master. It is synthetic integration evidence, not published-head execution, independent QA, Firebase activation or migration readiness.

## Observed behavior

On PostgreSQL 16.14, all metric, weight-import and Wear writer-first cases observed deletion blocked through `pg_blocking_pids` before releasing the real writer transaction. Weight, eligible goal, sync and supported receipt state committed before deletion intent. Intent-first writers left those states unchanged. Injected aborts rolled back domain/receipt state; retries and replay did not duplicate changes. Ordinary unmapped local accounts stayed writable. The maintained deletion PostgreSQL suite passed 23 tests, zero failures/skips, including timeout/lost-response, actual process termination, stale claims and rollback refusal. Both test commands exited 0. No product defect was reproduced.

Evidence: [scenario results and PostgreSQL blockers](ordering-results.json), [temporary harness](ordering.cjs), [ordering output](ordering.log), [maintained deletion output](maintained-deletion-postgres.log), [commands](commands.ps1), and [exact validation manifest](manifest.json). The manifest binds the original artifact bytes. `source.patch` preserves the exact applied patch.

## Limits

- The temporary harness calls actual metric/import route handlers and the Wear service with synthetic identities; it bypasses HTTP authentication middleware and does not run a device.
- Import fixtures contain weights only. Food writes outside the weight transaction are not certified. Import has no operation receipt: its repeated call is a same-value overwrite control, not operation-ID idempotency.
- Pending writers produced a metric-handler 500 or import/Wear P2010 rejection. State safety passed; runtime error presentation was not assessed.
- No full-suite rerun, real provider call, live account, credential, provisioning, deployment or release occurred. AUTH_PROVIDER remained local; the dormant coordinator used synthetic providers only.
- The original 811-test result and independent 25-test QA result remain historical at their original source identities; neither was relabeled as execution of this combination.

## Source and reproduction identity

| Binding | Identity |
| --- | --- |
| Master | `547206a1b372b73fc95fc412ad453b8099440000` |
| Master tree | `0512b6da0c86f102c3691757033a7a4c889afa11` |
| Published PR453 head | `c62450c77c7b6a127e04cc698cdcb7d11cb7d762` |
| Published head tree | `2c51305681eb4027246784cd9333945a62edee3c` |
| Head parent / observed API base / merge-base | `8eb6014adc6ed0ea327fa09fbd2af76afef284d5` |
| Synthetic tree | `5a68e939a27dfc890e239058eb298be7f4564db5` |
| Patch SHA-256 | `7e05772d6d38ec1858265904cfd0435455ba0b436520467fcc839172ca5dee53` |
| Manifest SHA-256 | `16ad1ec29e19fe71e3fd05ad19d732e75666077afb77cd83b89bc5d8b26b9a51` |
| Harness SHA-256 | `a26865063c5eaade0497d8571b39d72b7c9c4a526271166a1952fb6c3ce40ae0` |

The synthetic tree was made by applying the own-parent c624/8eb patch to detached master, without conflict resolution, committing, or updating product refs. Reproduce the indexed tree with the recorded checkout, `git apply --index source.patch`, and `git write-tree`; relocate the retained harness to the sibling `validation-evidence-453` directory used in commands.ps1. Existing backend dependencies were read through NODE_PATH; ts-node used transpile-only mode, not a fresh typecheck. The fresh disposable server was bound to 127.0.0.1:55453 and database calibrate_test_453_order. Both named test schemas and the database were removed and process 30072 stopped; [cleanup](cleanup.log) and [server log](postgres.stderr.log) retain observations. Exact original commands/logs are preserved, including setup-only missing-binary/module-path failures; these were not product test failures.

## Replay and retained originals

PR431, PR437 and PR442 are human-merged. Original head `d4b6d9f8f96226cbe9fdc4530ab0e0c329d7b661` on parent `4751d8d89301c18fb0fed7244c3354477e804c2b` has an equivalent own-parent patch to c624/8eb, with all 23 changed product blobs identical. GitHub attributes the 2026-10-09 01:56:30 UTC force-push only to shared account MChartier; the human/tool executor remains unresolved. This report does not approve or attribute that historical action.

Preserved historical records: [original evidence](https://github.com/MChartier/calibrate-health/blob/3d24710f48c1aac1d1caaa5f50554c00a8c44efc/README.md), [original handoff](https://github.com/MChartier/calibrate-health/blob/46bdafe01bdc9c66f1ad4cf4ea63566eb4ca8981/handoff.md), [QA comment6070919502](https://github.com/MChartier/calibrate-health/pull/453#issuecomment-6070919502), and [detailed QA](https://github.com/MChartier/calibrate-health/blob/3435052563f757f2095b6215a3ad0f63507184ff/verdict.json).

Exact pre-edit descriptions: [PR453](old-pr453-body.md), SHA-256 `f0af08f464c3bd818cb25d2565d7326e6fd261028e419f5698c3f31cb72a4bdc`, updated_at 2026-10-09T01:56:30Z; [issue451](old-issue451-body.md), SHA-256 `d66279eb52197d1b5b85318411fc4088e4d0e1fb14159468ee23f04ef54c37a4`, updated_at 2026-10-08T23:03:40Z. [Prepublication readback](prepublication-readback.json) retains all current feedback and current-head CI identities. The quota-only bot refusal is not a completed review of c624. Same-owner independent QA must reassess the final narrative and applicable evidence before readiness.

## Retention and ownership

Owner: existing issue451 task `01a11d07-0279-75cd-8185-16209fa6301d`, under ROOT's explicit evidence/metadata admission. This directory is appended to nonmerged evidence ref `evidence/451-deletion-d4b6d9f`, descending from the exact original handoff. Preserve indefinitely unless explicitly released by the human; never merge this ref into product history. Original files and their identities remain unchanged. The artifacts were inspected: SQL logs contain parameterized statements and synthetic IDs, and harness identities/data are synthetic. No live account data or credential values were found. Host paths and the loopback disposable database identity are retained for reproducibility in the same authorized repository.

Execution pin: `f0919b184b6344d6279178b2388190936ca432a9`; review overlay: `97e5583c8355f3673aad0835c0ce3ca1486aeb8b`, with supplied direct amendments. No source, readiness, Project or lifecycle mutation is part of this publication.
