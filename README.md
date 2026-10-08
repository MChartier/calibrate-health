# PR441 documentation correction

C1 distinguishes actual master `9dc0739` from the source merge-base/captured baseline `4cbcbc74`. R2 frames the retained release/Compose chooser as maintainer/internal operations. The original application source and evidence remain unchanged.

The additive source commit is `cd8932b24b76af564d7e50f69750dba8f44c8e68`, parent `0c26cea12e3ecdbc962eebaeb140af35f54ab95a`. Only README.md Releases and deployment and docs/deployment.md change: +14/-12. Full proposed published scope is two commits, 30 paths, +627/-785.

- [Exact prior PR body](pr-body-before.md), UTF-8 SHA-256 `171fa1321cea45531d8305d9eb182a3a24c16100fcdafb3f67a99e3a141c7a30`; retained before editing.
- [Full ordered commit/file scope, parents, checks and impact](correction-evidence.json).
- [Exact two-file correction](correction.patch).
- [Documentation checks](doc-checks.json): unchanged commands, fenced blocks and links; 25 local link paths verified; README outside the reserved section and native/OTA instructions unchanged. [Comparator](check-docs.cjs).
- [Maintained deployment test log](deployment-tests.log): 26 passed, no failures or skips. No expensive unaffected suites rerun.
- [Existing independent target-impact QA](https://github.com/MChartier/calibrate-health/blob/c218350e629c3a7c3bf1440e606ae9f9e2c51d94/verdict.json); historical 117 tests are not new execution.
- [Recorded child452 impact](https://github.com/MChartier/calibrate-health/pull/452#issuecomment-6070751643); child source remains unchanged.

Commands, workers, CI gates, receipt verification, signing/credential stages and retry semantics are preserved. PR450 reserved sections remain untouched. Final current-head CI/review and independent reassessment are separate gates. No application UI change; no capture or GitHub rendering check claimed.

Retention: dedicated nonmerged evidence ref owned by replacement task `01a11db5-8540-740a-a673-1026c0b90007`; retain without expiry with original evidence refs.
