## Summary

Maintainers currently choose among three server release forms and run native build and submit separately. This provides one **Release server** chooser for new releases and recovery, plus `native:release` for local build-and-submit and `--skip-build` retries. A single deployment guide explains which operation to use.

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

Windows fixture checks: release **154 passed / 2 Linux-only skips**, native **254 passed**, deployment **26 passed**; release configuration/acceptance passed. [All five hosted workflows passed](https://github.com/MChartier/calibrate-health/blob/fa378d82eb524b33ada2de4291eb34bc8d312be5/issue440-evidence/CI.md), including both publisher-shell cases skipped on Windows. Complementary shallow-checkout/platform skips and the quota-only review refusal are documented there. See [revision-scoped independent QA verdicts in the PR discussion](https://github.com/MChartier/calibrate-health/pull/441#discussion_bucket). No operator release workflow, signing, native package build, Play upload, image/OTA publication or deployment was executed; hosted CI did run its authorized builds and smoke checks.

[Complete scope, source identities, check logs and limitations](https://github.com/MChartier/calibrate-health/blob/aead6ffa9e6a6002c4195f9ef440511238cba6d9/issue440-evidence/scope.json): one product commit, 30 files, +625/-785. Only product changes, maintained regression tests and maintained documentation enter this PR; [historical source and screenshots](https://github.com/MChartier/calibrate-health/blob/f44643d0bdfd2ec4a26e14b5571e5ba94dd8cb07/pr401-recovery/README.md) and new capture records remain on nonmerged evidence refs.

Base: `4cbcbc740fbe5fa5646b4de31951c79a653176d5`. Head: `0c26cea12e3ecdbc962eebaeb140af35f54ab95a`.
Implementing Codex task: `01a114af-c6d1-705c-ade9-39553731d038`.
