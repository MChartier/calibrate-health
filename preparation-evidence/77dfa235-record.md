# Final journal checkpoint evidence

This supplements, and does not replace, the original evidence record.
Owner and retention: same sole issue421 owner and non-merged evidence ref;
retain all original records for review/recovery. No history or receipt deleted.

Source/head: 77dfa235ed7f75f854649af86a12c820b373adcc
Base: 4728d4f75b70e6440a9778a42cd2224a300db725
Host: mchartier_zbook, Windows, Node v24.19.0. Executed 2026-10-05 around 17:15 UTC.

From backend/: node -r ts-node/register --test test/firebase-migration.test.js test/credential-provider.test.js test/firebase-migration-cli.test.js test/migration-journal.test.js

The adjacent 77dfa235-tests.txt is the raw returned stdout: 24 passed, 0 failed,
0 skipped, process exit 0. All fixture and harness code is retained in the four
maintained test files at the exact source commit. ts-node compiles the tooling.
Real filesystem/child-process tests verify journal resume, exclusive ownership,
torn-record rejection, state-transition constraints, and abrupt process exit
retaining import intent and lock. The Firebase destination/verifier remain
synthetic; no network authentication or live import was executed.

Dead-code/configuration gates passed after journal introduction. Backend
typecheck and initial-head applicable CI passed; production sources are unchanged
by the journal addition. Final-head CI/review are tracked on PR423, not claimed
by this record. Full final merge diff inspected: 9 files +1054/-0 (440 tooling,
403 tests, 211 runbook lines). Evidence remains outside that diff. No UI changes.

Observed tool limitation: rendered-PR inspection attempted twice; the browser
kernel failed at initialization with apply deny-read ACLs. API body/evidence
reads succeeded. Rendered presentation is unverified, not silently waived.

The journal is single-host storage, not a SQL/Firebase writer freeze or a
power-loss durability certification. A separately authorized test project,
runtime identity/lifecycle integration, externally enforced write coordination,
and production-specific storage/ACL validation remain future gates. No readiness,
production access, import, cutover, deployment or release is claimed.
