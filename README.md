# Issue457: trusted candidate CI and deterministic goal smoke

Source: `0c9c839ee71bc2c3e4599b5b2580ff8ffda3f7e5`, actual master/base and source merge-base `547206a1b372b73fc95fc412ad453b8099440000`. One focused commit, 12 maintained files. [Full ordered scope and limitations](scope.json).

The unchanged goal smoke reproduces **90,000 instead of84,000** on disposable synthetic PostgreSQL. Its fixed version preserves the expected weights, keeps one explicit active-goal identity and passes every later timezone, Wear and import case. [Before](goal-smoke-before.log), [After](goal-smoke-after.log). No application UI changes. Local PostgreSQL16.14 differs from CI's retained15-alpine configuration; hosted CI supplies that platform check.

The release gate now consumes existing read-only reusable checks for explicit candidate/source SHAs inside the trusted release run. [60 focused checks](contracts-final.log) exercise missing/failed/skipped CI, wrong source/run/attempt, newer failed-job precedence, unchanged-candidate retry and both premerge checks. [Release suite](release-tests-final.log):160 passed,2 existing skips. No real release or provider operation ran.

Original failures: [release gate](original-release-gate.log), [database smoke](original-database-failure.log). [Original API identity](original-release-run.json) and [real skipped-job names](original-build-jobs.json) ground the same-run API contract. The workflow was not dispatched to simulate a release.

[Original issue description](issue-before.md) and [exact source diff](source.patch) retained. PR441/452/455 remain separate and unchanged; overlapping parent/child integration and readiness belong to ROOT and independent QA. Detailed artifact digests are in [manifest](manifest.json).

Retain without expiry on this dedicated nonmerged evidence ref; owner01a11db5-8540-740a-a673-1026c0b90007.
