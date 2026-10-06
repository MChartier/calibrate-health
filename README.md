# PR434 independent QA

Verdict: evidence-incomplete, with changes-required code findings.

## F1 (P1)

Final ref verification precedes the entire CI inventory read. A master change during that read is accepted, allowing the head-only merge API to merge against a different base. Post-merge ancestry verification prevents publication but cannot undo the merge.

Mock changes master when actions/runs is read: inspectCi returns no pending workflows with only one master read.

Read PR/head/base and master again after the complete CI/run-attempt inspection and immediately before authorizing merge. Retain the documented unavoidable final API race limitation.

## F2 (P2)

Run selection ignores pull_requests number/base identity. Successful runs for the same head/branch but another PR or base are accepted as this release PR validation.

All five synthetic runs carry pull_requests number 99/base c.../ref other instead of requested PR12/base b...; inspectCi still passes.

Bind accepted run evidence to the intended PR and tested base, using authoritative GitHub run/event/check metadata; fail closed for missing or ambiguous identity. Add wrong-PR, stale-base and empty-association maintained cases.

## F3 (P2)

The current PR body will become stale after this verdict because it says Independent QA remains pending; Project Current PRs still says Not created. No native closing association exists.



Remove operational QA-pending text from the PR body and keep outcome/evidence concise. Coordinator must set verified Current PR and report unsupported nonclosing native linkage honestly.

Full bindings and scope: verdict.json. Probe: qa-probe.mjs (run from a directory containing exact candidate checkout at review/). Observed output: WRONG_PR_AND_BASE_ACCEPTED true; MASTER_CHANGED_DURING_READ_ACCEPTED true masterReads 1.

Retention: dedicated nonmerged evidence ref, owned by independent QA task 01a1128e-30ca-76da-bdf8-6e588e957030; retain for lifetime of PR434 review and release-gate recovery history. Never merge this record into product history. Original owner evidence and receipts remain untouched.
