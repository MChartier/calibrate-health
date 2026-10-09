## Summary

Maintainers currently choose among three server release forms and run native build and submit separately. This provides one **Release server** chooser for new releases and recovery, plus `native:release` for local build-and-submit and `--skip-build` retries. A single maintainer guide explains which release, internal deployment, or recovery operation to use.

The existing manual publication boundary, exact-candidate CI gate, image receipt verification and separate signing/Play credential stages stay in place. Image-only recovery remains available without OTA or deployment.

Closes #440. Recovers the useful scope of #401; its original branch and evidence remain retained. No stack dependency on #404 or #439.

## Test plan and behavior evidence

This is a CLI/workflow change with no changed application UI. [Source-bound before/after observations and reproduction](https://github.com/MChartier/calibrate-health/blob/aead6ffa9e6a6002c4195f9ef440511238cba6d9/issue440-evidence/README.md) use actual isolated source imports, synthetic requests and mocked native workers.

| Scenario | Expected and observed |
| --- | --- |
| Choose a new release or recovery operation | Baseline has three forms; final has one with five selections. All five map to the intended existing worker; malformed or mixed inputs reject before routing. |
| Recover an image without downstream publication | `image-only` routes solely to the image worker with `publish_latest` false by default. Maintained contracts verify its reduced permissions; receipt tests preserve all three historical caller identities and rejection of conflicting/untrusted evidence. |
| Candidate CI is missing, failing, stale or awaiting approval | Existing CI-gate tests fail closed. The gate helper and publication workers are unchanged; validated blocked candidates remain available for failed-job retry with unchanged refs. |
| Build and submit a local native release | The final single command produces the same build-then-submit worker arguments as the baseline's two commands. Submission awaits build success; an injected build failure stops before submit. |
| Retry retained native artifacts | `--skip-build` invokes submit only and resolves no signing path. Existing worker tests reject stale source, changed artifact hashes and dirty source before reuse. |

## Supporting checks and limitations

Historical Windows fixture checks at `0c26cea`: release **154 passed / 2 Linux-only skips**, native **254 passed**, deployment **26 passed**; release configuration/acceptance passed. [All five hosted workflows passed at `0c26cea`](https://github.com/MChartier/calibrate-health/blob/fa378d82eb524b33ada2de4291eb34bc8d312be5/issue440-evidence/CI.md), including both publisher-shell cases skipped on Windows. Complementary shallow-checkout/platform skips and the quota-only review refusal are documented there. See [revision-scoped independent QA verdicts in the PR discussion](https://github.com/MChartier/calibrate-health/pull/441#discussion_bucket). No operator release workflow, signing, native package build, Play upload, image/OTA publication or deployment was executed; hosted CI did run its authorized builds and smoke checks.

[Complete scope, source identities, check logs and limitations](https://github.com/MChartier/calibrate-health/blob/aead6ffa9e6a6002c4195f9ef440511238cba6d9/issue440-evidence/scope.json): the original product commit, 30 files, +625/-785. The final proposal includes one additional documentation-only commit across two of those files. Only product changes, maintained regression tests and maintained documentation enter this PR; [historical source and screenshots](https://github.com/MChartier/calibrate-health/blob/f44643d0bdfd2ec4a26e14b5571e5ba94dd8cb07/pr401-recovery/README.md) and new capture records remain on nonmerged evidence refs.

The [current-target impact assessment](https://github.com/MChartier/calibrate-health/blob/73c205a142ec34d8afc76413aa720d63a6a09ce9/impact.json) finds no overlap with the incoming authentication and same-day goal corrections; the conflict probe preserves both changesets. Existing release behavior and CI evidence remain applicable to the unchanged head, with their original source identities retained. The earlier assessment against `9dc0739` and the original reviewer's 117 tests remain historical. No integrated runtime execution or new test run is claimed.

The [documentation correction](https://github.com/MChartier/calibrate-health/blob/02833792aef31b534cb1010e2edb4d7081400ea7/README.md) preserves commands and links; its 26 deployment checks passed. [All five workflows passed at the proposed head](https://github.com/MChartier/calibrate-health/blob/4852cccf92047a17d72014674a1e0f5371255b3d/final-receipt.json). C1/R2 passed prior independent QA, and issue440's current owner reference is corrected. Same-lane QA must reassess this final description and issue against the current target before readiness.

Actual direct target and ultimate master: `547206a1b372b73fc95fc412ad453b8099440000`. Source merge-base and captured evidence baseline: `4cbcbc740fbe5fa5646b4de31951c79a653176d5` (also the PR API-reported base). Proposed head: `cd8932b24b76af564d7e50f69750dba8f44c8e68`. No application UI changed.
