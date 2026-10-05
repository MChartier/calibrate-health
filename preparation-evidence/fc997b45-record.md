# SQL foundation checkpoint

Source/head: fc997b45558c7f3ca610e947e800c9424f43b5ce
Base: 4728d4f75b70e6440a9778a42cd2224a300db725
Owner: same sole issue421 task/branch; prior records remain immutable and retained.
Host: mchartier_zbook, Windows, Node 24.19.0. Executed 2026-10-05.

From backend/: node -r ts-node/register --test test/firebase-migration.test.js test/credential-provider.test.js test/firebase-migration-cli.test.js test/migration-journal.test.js test/config-credential-provider.test.js test/mcp-oauth.test.js test/account-tokens.test.js test/routes-user.test.js

Adjacent raw output: 54 passed, 0 failed/skipped, exit 0. Fixture/harness identity
is the eight named maintained test files at the exact source above. No Firebase
connection or live account reads. ts-node compiled the preparation modules.
Backend typecheck, dead-code gates and 17 database-helper unit tests also passed.

Actual CI database run: https://github.com/MChartier/calibrate-health/actions/runs/37349768401
Both populated-upgrade and v0.14.0 encrypted rollback/re-upgrade succeeded. The
maintained populated-upgrade test at the source commit exercised immutable SQL
mapping, collision rejection, local account deletion cascade, password-triggered
security-version advancement, same-hash stability, version-only advancement,
stale approval rejection and version-decrement refusal on synthetic PostgreSQL
rows. Local Docker version lookup did not respond and was stopped; no local
database execution is claimed. CI used disposable databases under repository
workflows. This is not a real Firebase import rehearsal.

The review finding on 77dfa235 concerning the local bcrypt byte limit is fixed:
Firebase credentials longer than 72 bytes reach the provider; local credentials
remain capped. Regression uses a synthetic 120-byte Unicode password.

Non-UI applicability: the change adds offline tooling, an additive schema and a
backend MCP concurrency invariant; no app UI is changed. Source mapping rows
grant no authentication authority, and AUTH_PROVIDER remains local-only. Runtime
Firebase lifecycle, external event enforcement and test-project rehearsal remain
unfinished and unauthorized for live execution. Security-policy options and the
60-second hard-expiry recommendation are proposals, not enabled behavior.

Retain this record and all earlier receipts on the dedicated non-merged evidence
ref for review/recovery. Do not silently replace prior identities. Local PR-body
pixel inspection is recorded separately against the exact API body digest; it is
not private GitHub-page inspection or a UI baseline waiver.
