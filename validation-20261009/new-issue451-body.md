## Problem

Future Firebase account deletion cannot be one SQL transaction. Current deletion removes the SQL account immediately; it has no durable provider reconciliation or retained completion receipt. A crash or ambiguous provider result could leave the two stores inconsistent.

This is a bounded preparation child of #421, grounded in its [accepted deletion contract](https://github.com/MChartier/calibrate-health/blob/3eb583d972cc529509bd8145c8cefb504b3cd000/preparation-evidence/communication-before-20261006/issue-body.md#deletion). Firebase stays disabled and existing local-account behavior stays unchanged.

## Requirements and acceptance

- Accept only an internal recent-authentication proof bound to the existing user, immutable project/UID and security version. Persist intent, pending state and revocation atomically; wrong identity or stale proof has no side effect.
- Keep SQL data while the provider result is unresolved. Reconcile the exact bound identity through an injected synthetic provider; timeout, lost response or mismatch cannot mean completion or restore access.
- After confirmed provider deletion, finalize SQL cleanup and an independent durable receipt transactionally. Retries and stale workers cannot duplicate or misapply completion; receipts survive account cascade.
- Enforce pending-deletion denial across browser/native sessions, MCP, Wear and legacy recovery writers while preserving ordinary local-account behavior and the password-change current-session exception. An outage alone never starts deletion.
- Validate process crashes, duplicate claims, both race orders, partial failure and replay with synthetic identities and real disposable PostgreSQL. Populated upgrade and rollback checks must preserve existing accounts and never silently erase pending intent.
- No runtime activation, real provider adapter/call, public pending-deletion API, client cleanup change, receipt purge policy, live data, credentials, provisioning, migration or release. This does not complete #421.

## Implementation plan

Build one additive internal deletion coordinator and minimal durable schema on master, whose PR431, PR437 and PR442 prerequisites are now human-merged. Record accepted intent before provider work; perform bounded provider reconciliation outside SQL locks; recheck the claim and identity before final SQL cleanup. Retaining SQL until provider confirmation and forbidding automatic reversal of accepted intent are conservative technical choices within the original fail-closed contract, not new user-facing retention or cancellation policies.

Use maintained synthetic adapters and real PostgreSQL crash/race tests; keep all production invocation paths disabled. Preserve the [offline-first requirement](https://github.com/MChartier/calibrate-health/issues/421#issuecomment-6000049703), local defaults and original [migration requirements](https://github.com/MChartier/calibrate-health/issues/421). Coordinate auth/session boundaries with PR450 without importing or editing its client work. GCP422 and final hygiene remain later dependencies.

## Implementing Codex task

Verified implementation owner: `01a11d07-0279-75cd-8185-16209fa6301d`. The same owner completed scoping, implementation and the explicitly approved publication. Original #421 ownership and auth-stack history remain preserved.

## Implementing PR

[Draft PR453 — dormant durable cross-store deletion](https://github.com/MChartier/calibrate-health/pull/453) now targets master. Its authentication prerequisites are merged; native closing association remains this child issue only, and #421 remains unfinished. The final PR narrative and applicable evidence require independent QA reassessment.

[Exact description before this target update](https://github.com/MChartier/calibrate-health/blob/46bf9f89f01a5f2bfd86368218b872367c58b333/validation-20261009/old-issue451-body.md); [earlier retained description](https://github.com/MChartier/calibrate-health/issues/451#issuecomment-6070770630).
