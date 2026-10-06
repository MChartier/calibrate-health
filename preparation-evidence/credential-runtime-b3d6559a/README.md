# Credential verification checkpoint evidence

Owner: issue421 implementation task 01a10cfe-a79f-7198-9e8f-2b4dc6703031.
Purpose/retention: immutable review evidence on the existing nonmerged issue421 evidence branch; retain for review and migration history. Never merge this evidence directory into product.

Product head: b3d6559ad8abd1c2725c509357302b1f0e12cdd2
Actual master base: 2d7a4f659d8d1a8d27cfb4210db1bbe22b3e536b
PR: https://github.com/MChartier/calibrate-health/pull/431

## Observable contract

Before: separate runtime bcrypt comparisons and a scripts-only prepared provider adapter. After: one runtime local comparison helper, same caller-owned account lookup, input policy, access checks, sessions and MCP security-version transaction. No UI, identity/schema, offline or Wear changes. Original scripts import remains compatible.

Real bcrypt tests demonstrate valid password acceptance, unknown/empty hashes rejected, and preservation of legacy raw reauthentication comparison beyond 72 bytes. The prepared local adapter still rejects overlong input; MCP retains its original byte-limit/dummy-comparison logic. Route/service regression suites exercise login, password/deletion, recovery, token replay, session revocation and MCP authorization boundaries. Incomplete Firebase mappings are rejected before an injected request; synthetic provider tests cover project/UID/freshness, errors and timeout. These mocks prove local control flow only, not Firebase integration.

## Executed validation

Windows host mchartier_zbook; Node24.19; isolated credential-runtime-421 worktree; synthetic fixtures only. Host setup used node scripts/dev-env.mjs setup:host. No live database or provider read.

- npm --prefix backend run typecheck: exit0 (typecheck.log).
- In backend: node -r ts-node/register --test --test-concurrency=2: 765 pass, 0 fail/skip (backend-tests.log).
- npm run knip: exit0 (knip.log).
- git diff --check: clean.

Full published scope: one product commit, 12 files, 168 additions/100 removals. Maintained tests and 7-line documentation adjustment only; no capture harness, logs, exported files or operational receipts in product history. product.diff binds the complete base-to-head change. Four loader adjustments preserve existing test stub isolation after module relocation.

No browser/device capture applies to this non-UI refactor. No real Firebase provisioning, credentials, import rehearsal, production migration, deployment or release. CI/review receipts follow separately. No readiness claim.
