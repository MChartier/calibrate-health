# PR449 review follow-up

Review: https://github.com/MChartier/calibrate-health/pull/449#pullrequestreview-5461020080
Reviewed head: eb142dd0bcc527398e83b91d29d4514fd9b4e516.
Fix head: 70e982f77752400d4b4f688280a0609a99713262.
Base remains 4cbcbc740fbe5fa5646b4de31951c79a653176d5.

- discussion_r4222581328: confirmed. Metric acceptance rereads User.timezone
  through the transaction after the planning guard; goal-day, acceptance-day,
  default date and future-date validation use that value. An explicit affected
  date is preserved. Receipt replay bypasses fresh date derivation as before.
- discussion_r4222581338: confirmed. Wear metric writes now acquire the shared
  planning guard before reading or writing the metric; weight imports had the
  same inverse order and are corrected too. Onboarding already locks the user
  first. Wear retains expected-revision conflicts; no Wear/import historical
  baseline rewrite is introduced.

The maintained PostgreSQL smoke forces a profile timezone writer to hold the
guard before a metric writer starts. It covers LA-to-UTC and UTC-to-LA with
explicit and omitted dates, preserving receipts. Separate forced web/Wear
overlaps cover both writer orders, expected stale-revision conflict, final
persisted weight and idempotent replay without deadlock. CI results are linked
in the final PR body and handoff; this record does not predeclare them passed.

Targeted metric/watch/import/route suite: 56 passed; backend typecheck passed.
review-fix-tests.txt retains the output. An additional single import test run
checks the final lock-before-read assertion. Unaffected client suites and Expo
builds were not rerun.

Original matched captures remain unchanged and are preserved at evidence
commit ce02f46f2d6b3794d3911a74a7c29a63ac6960c4, with their original source
identities (Before 4cbcbc740fbe5fa5646b4de31951c79a653176d5; After eb142dd0bcc527398e83b91d29d4514fd9b4e516).
They are not relabeled as new-head captures. Applicability assessment: the
captured scenario has a stable account timezone, explicit same-day metric date,
and no competing writer, so these review fixes do not change its UI output.
The new boundary/concurrency behavior is established by maintained route and
real PostgreSQL tests, not these images. Independent QA must verify this
assessment and inspect the original pixels/provenance. Native remains deferred.
