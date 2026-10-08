# PR449 final source and evidence binding

Product head: 650862e1c13be66fe5ec05495320cc66ac32f8bb.
Immediate parent: f805e6872c94000156219ddba0e8e01b0c8d490c.
PR base/merge-base: 4cbcbc740fbe5fa5646b4de31951c79a653176d5.

The final change removes calendar eligibility from Wear syntax parsing. The
transaction-current timezone after the planning guard is now the only authority
for rejecting a future metric date. 14 affected Wear tests and backend typecheck
passed. PostgreSQL run37828422760 passed both directions: UTC-to-LA rejection
without metric/goal/sync writes, and LA-to-UTC acceptance with one goal baseline
sync event. Both retain their original operation receipts on replay.
https://github.com/MChartier/calibrate-health/actions/runs/37828422760

The same run passes the accumulated same-day baseline, timezone, concurrency,
import, history-preservation and idempotency cases. Full CI and configured
engineering review are separately read back and recorded in the PR/final handoff.
All seven review findings have code/test dispositions in their inline threads;
independent QA must verify the final source and evidence before readiness.

Original genuine Before/After images and provenance are retained unchanged at
ce02f46f2d6b3794d3911a74a7c29a63ac6960c4. Before source is the PR base; captured
After source is eb142dd0bcc527398e83b91d29d4514fd9b4e516. Those images are not
claimed to have been recaptured from this head. Their stable-timezone, explicit
same-day normal metric correction still exercises the same observable result.
No client source changed. The shared helper preserves that scenario, covered
by the maintained normal-route tests; later Wear/import/timezone fixes affect
different paths and boundaries. Independent QA must verify applicability and
inspect original pixels, rather than infer it only from this statement.

Original image SHA256:
- before.png: 7aeaa3cbe18fe3c6f27a9bf2d191fb840c5d7d9551258308a3b817d9801190bd
- after.png: d7d0859ef5bf8f5c369556ebb20216ab05946061d8ba965eb430f3745b2e66a4

Earlier append-only review-fix records are preserved in the evidence history:
51bbbca76600fc007f7af18a58d3b54a9d081955,
f531785638f8367e36d7b64d74e6e83ec6473ee3,
6c0f1d4ea203edabe0fc6bfdc8234504bb4a6a1c,
f02859672e502c0ca6753ee82ac87588b960da76.
Native device evidence remains deferred; no readiness, merge or release action
is represented by this evidence record.
