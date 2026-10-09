## Problem

The [release candidate CI gate](https://github.com/MChartier/calibrate-health/actions/runs/37880190066/job/113658571223) stopped on approval-required checks for bot-created PR455. GitHub now requires maintainer approval for pull-request runs created by the repository token, so the current pipeline cannot complete unattended after the human triggers it.

A separately retried [database check](https://github.com/MChartier/calibrate-health/actions/runs/37880437998/job/113665062675?pr=455) passed all 48 migrations but failed the goal-pace concurrency smoke: 90,000 observed versus 84,000 expected. Source inspection indicates a date-dependent synthetic active-goal fixture, requiring disposable-PostgreSQL confirmation.

## Requirements and acceptance

- Reuse existing CI validation in the trusted release workflow on the exact candidate SHA, without a new token, protection change or routine human workflow approval. Fail closed on missing, failed, cancelled or wholly skipped required validation.
- Preserve current source/head checks, canonical release-only transformation, merge-tree verification, required check coverage and existing platform/rollback skip policy. Validation receives read-only permissions and no publication/provider credentials.
- Make the goal-pace fixture deterministic without weakening expected behavior or changing production goal semantics unless reproduction demonstrates a product defect. Cover all later timezone, Wear and import races.
- Preserve normal PR CI behavior and add proportionate maintained regression coverage for candidate identity, failure gating and the date-sensitive fixture.
- No live release rerun, immutable PR455/candidate edit, merge, tag, publication, provider, credential or protection-setting action.

## Implementation plan

From verified current master, reproduce the smoke failure on disposable synthetic PostgreSQL, correct fixture identity/order, and verify the complete smoke. Refactor the release's existing validation entrypoints for explicit candidate/source identity rather than pull-request event assumptions; check both initial and final premerge gates. Coordinate overlapping workflow/test/documentation files with PR441/452 owners, preserving their branches and evidence. Publish one focused draft fix with current-head CI and independent QA; describe any separately required operational recovery without executing it.

## Implementing Codex task

Proposed existing release owner: `01a11db5-8540-740a-a673-1026c0b90007`, currently idle after PR441 description refresh. ROOT admission and actual execution remain pending. The active quantity owner and original goal worktree remain undisturbed.

## Implementing PR

Not created. This is a new master-based follow-on; existing PR441/452 and immutable release PR455 remain unchanged.

Authority: the user requested hands-off release progression after triggering it, then explicitly said on October 9, “Let's fix the CI job and the pipeline defintiion together.” This authorizes the bounded code correction, not release execution or security-setting changes.