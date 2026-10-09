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

The [target-impact assessment](https://github.com/MChartier/calibrate-health/blob/c218350e629c3a7c3bf1440e606ae9f9e2c51d94/verdict.json) found the existing behavior/CI evidence applicable to actual master `9dc0739`; those observations and the original reviewer's 117 tests remain historical. Focused documentation checks verified unchanged commands and links, and 26 maintained deployment checks passed. [Final documentation correction and complete scope](https://github.com/MChartier/calibrate-health/blob/02833792aef31b534cb1010e2edb4d7081400ea7/README.md) records the exact sources and preserved description.

Actual target: `master` at `9dc0739e36168aa273530fe00ae5f85fb9c8a3fe`. Source merge-base and captured evidence baseline: `4cbcbc740fbe5fa5646b4de31951c79a653176d5` (also the PR API-reported base). Proposed head: `cd8932b24b76af564d7e50f69750dba8f44c8e68`. No application UI changed.
