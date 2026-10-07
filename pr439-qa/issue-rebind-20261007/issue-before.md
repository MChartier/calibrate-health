## Problem

Native users need a deliberate service choice that keeps credentials and recovery on the intended server. Self-hosted operators currently rely on environment-based administrator grants and need durable user-role management, safe first-owner setup and recovery. PR402 contains unmerged improvements, including a directory scan that holds the ownership lock and can block other account operations.

## Requirements and acceptance

- Preserve managed hosting as the default. Make native self-hosted selection explicit, tested and cancelable; failed/canceled selection preserves the current destination. Confirming a different service clears entered credentials and consent. Browser authentication and recovery remain on the serving origin.
- Separate Service & hosting from app diagnostics. Explain account/service boundaries and prevent switching while offline changes are unresolved or their state is unknown.
- Provide a bounded administrator directory containing only account ID, email, role, creation time and verification status. Require explicit role-change confirmation, fresh verified-admin authorization and last-verified-admin protection for demotion and deletion. Directory reads must not hold the exclusive ownership lock.
- Atomically grant exactly one first-account owner only on a genuinely new self-hosted database; never on managed hosting or a populated upgrade. Import valid existing legacy administrator IDs once, preserve an unverified owner's account after email-delivery failure, and recover only an existing verified account. Never reserve grants for future users.
- Preserve immediate authorization and account/server isolation across logout, refresh, cancellation and late responses, including master's offline workspace and revocation behavior. Keep issue421's credential-verification and atomic native-login contracts intact.
- Validate the database invariants with real cross-connection PostgreSQL cases, fresh/populated upgrade and rollback checks, and maintained client/API regressions. Demonstrate representative actual-base-to-final behavior with matched synthetic captures, including the native chooser. Historical After-only web images are not baseline evidence.

No provider activation, production account/access changes, credential changes, deployment or release is included. This scope follows the trusted human authorization for PR402 recovery and active backlog progression; related closed issues290/298 are context, while421/422 remain separate outcomes.

## Implementation plan

Follow the [retained recovery plan](https://github.com/MChartier/calibrate-health/blob/6b265afbb92951ba55e1c22212374225049c580e/pr402-recovery/recovery-plan.md) for a focused successor from reverified master: preserve original evidence, selectively port useful product/tests/contracts/documentation, fix directory locking, and resolve the seven identified auth/API-client/rollback conflicts. Coordinate shared imports and test loaders with the existing421 owner; do not import or rewrite PR431/437. Keep capture archives and one-off capture machinery outside the successor's published product history. The authorized continuation is implemented in draft PR439. CI and matched browser evidence are complete. Actual native chooser evidence remains blocked by unavailable device/emulator access; independent engineering review/QA is pending.

## Implementing Codex task

Implementing owner: verified native task ID `01a1145f-aae2-70e0-af56-3952f0eab012` (shareable URL unavailable). This follows the original cloud owner `/root/improve_self_hosting_experience` and its [explicit idle handoff](https://github.com/MChartier/agentic-development-workflow/blob/e7c61c50d8be01437c15e0c3cfcd3fa683e81571/runtime-next-scope/pr402-owner-handoff.json).

## Implementing PR

Active implementing PR: [PR439](https://github.com/MChartier/calibrate-health/pull/439) (draft). Historical original: [PR402](https://github.com/MChartier/calibrate-health/pull/402), retained open until the coordinator verifies replacement, evidence and dependencies.
