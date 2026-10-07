# Final-head applicability and scope

PR436 final head: `d94a34d019bd9d993c27d33dbc1accc2cce61a87`.
Actual master/base/merge-base/ultimate target: `4cbcbc740fbe5fa5646b4de31951c79a653176d5`. No unmerged parent.

The captured implementation is `3ac32ffa92f1e429dd689e2f52683bd8ea045d15`. Its child changes only the OpenAPI description and corresponding generated TypeScript comment from “Range-only” to the accurate day-read/completion scope. No runtime source, schema shape, UI, fixture or asset changed. `npm.cmd run api:contract:check` passes with a clean generated diff. The original capture identity and manifest remain unchanged at evidence commit `7dd85c054275e336e1c42ff3b85ec6442d426c67`; do not relabel those images as newly captured at the documentation head.

Complete published inventory is in `published-scope.json` and `published-diff.patch`: two linear commits, ten files, 138 additions/13 deletions, all pages reconciled against API totals. First commit: four runtime files for saved reads and phone/watch acknowledgements/sync, three backend regressions, one maintained browser regression. Second commit: required API description and its generated comment mirror. No unrelated prerequisites, merges, renamed files or temporary artifact churn. No source changes were removed during cleanup: evidence was never in product history. Original product commit was 8 files / +136 -11; the final two additional contract files account exactly for +2 -2. Evidence ref is retention-only, never a merge target.

The configured bot refused due to review quota on `3ac32ffa`, comment6029479109. The documentation-only child has no separate bot review; no completed bot review is claimed at either head, and retries were not spammed. Full PR conversation, issue conversation, submitted reviews and inline comments were re-read. No actionable findings were present. Independent review/QA must assess current full scope, behavior, images and source applicability. This record is an implementation handoff, not a QA verdict or human-ready claim.

Issue435 retains its exact five headings and original report. Its verified implementing task ID is used because sharing returned “Thread sharing permissions or account policy could not be determined.” Native closing association and Project1 Current PRs both read back PR436. Coordinator/metadata owner manages pipeline state and readiness; implementation has not applied human-ready.

The capture manifest exact UTF-8/file-byte SHA256 is `0cf7c8c9bf85df16b517f79b2edb5dc0f7b121e1def9d53d940089b2bcc913d5`. `remote-access-readback.json` verifies authenticated GitHub access and exact remote content hashes for the provenance and four originals. The earlier evidence commit and manifest remain intact.
