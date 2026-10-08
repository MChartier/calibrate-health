# Same-day correction across accepted weight writers

Follow-up product head: 61b8dfc433d09532169e03b91a1482495c3b5a83.
Parent: 70e982f77752400d4b4f688280a0609a99713262.
Base: 4cbcbc740fbe5fa5646b4de31951c79a653176d5.

Review discussions4222728419 and4222728430 identified that Wear and imports
were serialized but did not apply the same-day baseline rule. Both are fixed
using goalStartingWeight.ts, also used by the normal metric route. Safety runs
before the final goal sync event, and the correction stays in the existing
transaction. Wear conflict/replay semantics and import KEEP remain intact.
Only a weight actually written for the acceptance-local day can correct that
day's current goal. Historical rows and body-fat-only updates do not qualify.

61 targeted tests passed (metrics, watch service/routes, import safety/parser),
plus backend typecheck. writer-path-tests.txt retains the output. Hosted
PostgreSQL adds assertions for the Wear baseline and one sync event, historical
Wear input, import create/overwrite, KEEP, historical edits, unchanged repeat
and preservation of completed food-day history. Hosted result is recorded in
the PR and final handoff, rather than predeclared by this record.

The original screenshot pair and all its source/build provenance remain at
ce02f46f2d6b3794d3911a74a7c29a63ac6960c4. The normal metric route now calls the
shared helper for the same predicate/update shown in the original capture.
Its stable-timezone, same-day 90-to-85 kg scenario has unchanged observable
behavior at this head; no frontend source changed. Captured After source remains
eb142dd0bcc527398e83b91d29d4514fd9b4e516 and is not relabeled. The newly covered
writer/concurrency behavior is supported by maintained PostgreSQL tests, not
the old images. Independent QA must verify this applicability assessment.
