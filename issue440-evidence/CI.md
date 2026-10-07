# Issue440 final hosted checks

All five hosted workflows completed successfully at `0c26cea12e3ecdbc962eebaeb140af35f54ab95a` against base `4cbcbc740fbe5fa5646b4de31951c79a653176d5`: Builds, Tests, Lint, Production Container Scan and Database Upgrade. [Exact run/check bindings and review disposition](ci-completion.json) retain the final inventory.

The [Linux Release Configuration log](hosted-release-configuration.log) confirms that both publisher-shell cases skipped on Windows ran successfully. Linux release tests passed 154 with two historical-fixture skips caused by shallow checkout; those two tests passed locally. Linux native tests passed 253 with one Windows-only skip; that test passed locally. This combines complementary platform evidence without claiming any skipped test ran on that platform.

The configured review returned a quota-only refusal at [comment6031504125](https://github.com/MChartier/calibrate-health/pull/441#issuecomment-6031504125), with no findings or review approval. Apply the authorized quota exception; independent QA remains required before coordinator readiness. No release, signing, upload or deployment was executed.

This supplements the [original source-bound observation](https://github.com/MChartier/calibrate-health/blob/aead6ffa9e6a6002c4195f9ef440511238cba6d9/issue440-evidence/README.md); it updates CI status without replacing previous provenance identities. [Exact artifact hashes](ci-manifest.json). Keep this on the nonmerged evidence ref, with the original owner/coordinator and no automatic expiry.
