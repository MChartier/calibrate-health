## Problem

Existing accounts depend on local credentials across login, recovery, sessions and deletion. The requested Firebase migration must preserve existing User.id, owned data, passwords where supported and access controls while keeping independent self-hosting available. The full migration remains unfinished.

## Requirements and acceptance

- Preserve immutable Firebase project/UID mappings, existing account identity/data ownership and browser/native/Wear session compatibility; local authentication remains available until an explicitly authorized cutover.
- Implement Firebase registration/login, recovery, verification, deletion and external credential-event enforcement, including lifecycle failures and session recovery.
- Follow the [human offline-first requirement](https://github.com/MChartier/calibrate-health/issues/421#issuecomment-6000049703): temporary outages allow local tracking, retain pending changes through restart and show pending reconnection. Unreachable authentication is not confirmed revocation; server access/replay still require valid authorization and account/server isolation.
- Preserve migration reconciliation, rollback and BCRYPT compatibility requirements. Separately authorized real-provider import/sign-in rehearsal and operational cutover are still required; synthetic checks do not establish migration readiness.
- Complete the relevant Firebase runtime foundation before [GCP preparation #422](https://github.com/MChartier/calibrate-health/issues/422). Keep pause/calendar work separate.
- The current credential-verification checkpoint is partial preparation only: centralize local verification for browser/native login, password reauthentication and MCP approval while Firebase stays disabled. Preserve identity, session, Wear and offline contracts; use maintained local/synthetic validation.
- No real-user reads/imports, provisioning, credential changes, deployment or release are authorized here. Retain all [original requirements and acceptance criteria](https://github.com/MChartier/calibrate-health/blob/3eb583d972cc529509bd8145c8cefb504b3cd000/preparation-evidence/communication-before-20261006/issue-body.md).

## Implementation plan

Follow the existing staged plan: additive preparation and identity mapping, bounded local credential-verification checkpoint, then remaining Firebase runtime/lifecycle work and separately authorized rehearsal/cutover. The [current checkpoint admission](https://github.com/MChartier/calibrate-health/issues/421#issuecomment-6021123566) preserves PR402's separate ownership and requires coordination for overlapping imports/tests. [Exact previous issue and retained plan/history](https://github.com/MChartier/agentic-development-workflow/blob/be7f2a00cbf9ced12d4b1a7a52f28e455695d7e3/issue-template-migration/calibrate-health-421-original.md).

## Implementing Codex task


Verified implementing Codex task ID: `01a10cfe-a79f-7198-9e8f-2b4dc6703031`. A shareable task link is not available through the current tools.

## Implementing PR

Current: [PR431 — local runtime credential verification](https://github.com/MChartier/calibrate-health/pull/431), a nonclosing partial checkpoint. Full migration remains open. History: [merged preparation PR423](https://github.com/MChartier/calibrate-health/pull/423). Implementation evidence and results belong in those PRs.
