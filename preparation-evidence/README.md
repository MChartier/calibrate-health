# Issue 421 stage-one evidence

Purpose: retained non-merged evidence for offline migration preparation. Owner:
sole issue421 implementation task 01a10cfe-a79f-7198-9e8f-2b4dc6703031.
Retain this ref and immutable commit for the review/recovery lifetime; no deletion
or replacement is authorized by this record. Repository readers can access it
with their existing repository permissions. No visibility or service change.

Source/head: d8a2ac141173ad6b9729602e0c528475c9b8ecd2
Base: 4728d4f75b70e6440a9778a42cd2224a300db725
Host: mchartier_zbook (Windows), Node v24.19.0.
Observed: 2026-10-05 17:06 UTC; code bytes tested match the committed source.

From backend/: node -r ts-node/register --test test/firebase-migration.test.js test/credential-provider.test.js test/firebase-migration-cli.test.js

synthetic-tests.txt retains the tool-returned stdout for this invocation, with
18 passed, 0 failed, 0 skipped, process exit 0. Fixture and harness identities
are the three maintained test files at the exact source commit above. CLI tests
spawn the actual command with temporary synthetic JSON; mocks only substitute
the Firebase transport/import destination and checkpoint persistence contract.
No Firebase, emulator, live DB, real accounts or credentials were accessed.

Also executed successfully: repository-owned setup:host (no source env copied,
no containers started), backend typecheck (including generated Prisma client),
test:dead-code (config tests, knip and production knip), git diff --check.
Backend typecheck covers production sources; ts-node compiles the preparation
TypeScript modules during the synthetic tests. No schema or runtime code changed.

Non-UI exception: baseline has no migration planner; final source provides the
offline inventory command and safety contracts. CLI accepted synthetic records,
returned held collisions (exit 2), sanitized malformed input (exit 1), and refused
--apply. There is no changed application UI, so no Before/After screenshot pair.

Full product merge diff reviewed: 7 maintained files, +827/-0: 342 tooling lines,
283 regression-test lines and 202 operator-runbook lines. No capture archives,
logs or temporary evidence are in that diff. No cleanup removed prior evidence.

This stage does not complete issue421. No live importer, durable store/lease,
SQL mapping, runtime lifecycle/security bridge or real Firebase rehearsal is
claimed. See the maintained runbook for remaining gates. GCP422 must wait for
the completed Firebase runtime foundation. Draft only; no readiness/merge gate
is granted by these synthetic tests.
