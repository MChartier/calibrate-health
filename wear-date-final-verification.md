# Final Wear date revalidation

Product head: f805e6872c94000156219ddba0e8e01b0c8d490c.
Parent: 521fc625824259ec1236b664301c02bea1b516f6.
Base: 4cbcbc740fbe5fa5646b4de31951c79a653176d5.

Discussion4222892570 was confirmed: Wear parsing could precede a committed
timezone change. The mutation now compares its metric date to the locked
account-local today before any metric read/write. This preserves historical
edits and original receipt replay without saving a now-future row.

14 affected Wear service/route tests and backend typecheck passed.
Hosted PostgreSQL run37827497809 passed all accumulated smoke scenarios,
including the forced UTC-to-LA overlap: a mutation parsed for October9 is now
future-dated, returns400, changes no metric/goal/sync event, and replays that
rejection even after the timezone switches back. The full CI and configured
review outcome are recorded in the final PR/handoff rather than predeclared.
https://github.com/MChartier/calibrate-health/actions/runs/37827497809

All six review findings have code changes and test evidence: transaction-current
timezone, lock ordering, Wear baseline/sync, import baseline/sync, import
partition/count/warning timezone, and Wear future-date revalidation. Thread
replies link each fix to hosted PostgreSQL results. Independent QA is required.

This final guard affects a competing timezone/Wear path only. The original
normal metric-route screenshot scenario remains unchanged. Original captures,
source/build hashes and fixture provenance remain at
ce02f46f2d6b3794d3911a74a7c29a63ac6960c4; captured After remains
eb142dd0bcc527398e83b91d29d4514fd9b4e516, not this final head.
The follow-up records at51bbbca76600fc007f7af18a58d3b54a9d081955,
f531785638f8367e36d7b64d74e6e83ec6473ee3 and
6c0f1d4ea203edabe0fc6bfdc8234504bb4a6a1c retain earlier source/applicability
assessments. No original pixels or records were replaced. QA must verify this
assessment against the exact final source and original images.
