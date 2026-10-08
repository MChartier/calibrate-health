# Import classification under the planning lock

Product head: 521fc625824259ec1236b664301c02bea1b516f6.
Parent: 61b8dfc433d09532169e03b91a1482495c3b5a83.
Base: 4cbcbc740fbe5fa5646b4de31951c79a653176d5.

Review discussion4222813175 correctly identified that import row partitioning
still used the pre-lock account timezone. The execute route now partitions the
parsed weights after acquiring the guard and reading the current timezone;
returned skipped counts and warnings come from the same transaction result.
The separate preview remains a preview of the account state at preview time.

Six affected import tests and backend typecheck passed. PostgreSQL coverage
forces timezone changes in both directions before import acceptance, testing
both candidate dates, accepted/skipped counts, future warnings and eligibility
of the resulting baseline correction. The current-head hosted outcome and final
configured review are recorded in the PR and final handoff.

This change affects imports only. Original stable-timezone metric-route
captures remain applicable under the earlier recorded assessment. The source
and bytes of the original captures/provenance remain unchanged at
ce02f46f2d6b3794d3911a74a7c29a63ac6960c4; they are not new-head captures.
Prior review-fix records remain preserved at 51bbbca76600fc007f7af18a58d3b54a9d081955
and f531785638f8367e36d7b64d74e6e83ec6473ee3. Independent QA is still required.
