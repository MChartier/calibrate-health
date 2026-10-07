# Issue440 release entrypoint behavior evidence

The actual base requires three server request forms and separate native build/submit commands. The successor provides one server chooser and one native release command while reusing the existing publication and credential stages.

Base: `4cbcbc740fbe5fa5646b4de31951c79a653176d5`. Final source: `0c26cea12e3ecdbc962eebaeb140af35f54ab95a`; tree: `055ff7b71b479c0f4ce9aff641493ed893491adb`. Owner: native task `01a114af-c6d1-705c-ade9-39553731d038`, designated Windows host verified. Execution workflow-v3 pin `f0919b184b6344d6279178b2388190936ca432a9`; review pr-review-v3 pin `97e5583c8355f3673aad0835c0ce3ca1486aeb8b`.

## Observable comparison

[Observed inputs and outputs](behavior.json), produced by [the exact retained harness](observe-behavior.mjs), import both isolated baseline and final sources. The harness enumerates the actual forms, submits five synthetic bound requests to the real verifier, and rejects unknown/mixed inputs. Eight Git Bash cases execute only the form validation prefix, before artifact construction or publication. Native workers are injected mocks: baseline build then submit produces the same worker arguments as final release; skip-build resolves only the Play path and calls submit; simulated failed build calls no submit. The unchanged real submit worker verifies retained source/config/artifacts before loading Play credentials; existing native tests cover stale source, changed artifact hashes and dirty source. This is CLI/workflow observable-contract evidence, not device, browser, signing, build or upload evidence. There is no changed application UI flow.

## Checks and limits

- [Release tests](release-tests.log): 154 pass, two existing Linux-only publisher-shell cases skipped on Windows. Their hosted Linux execution remains pending when this record is written.
- [Native tests](native-tests.log): 254 pass using fixtures/mocks.
- [Deployment tests](deploy-tests.log): 26 pass using mocked commands.
- [Release configuration/acceptance](release-check.log): pass.
- [Final workflow contract check](final-contract-tests.log): 33 pass after recovery documentation reconciliation.
- Three changed workflow YAML files parsed successfully; 50 relative Markdown file links resolved; staged/unstaged diff hygiene passed.
- No real workflow dispatch, signing, artifact build, Play upload, image/OTA publication, provider or deployment action ran.

[Full scope and unchanged safeguard identities](scope.json) records the only published product commit and all 30 paths: product workflows/CLI, maintained regression tests and necessary maintained guides. The release CI helper, receipt policy, image/prepared workers and trust list are byte-identical to base; cut-worker changes are operator messaging only, with one summary variable renamed to display the recovery tag. No audit bypass is restored.

## Retention and reproduction

This directory belongs only on the nonmerged `evidence/pr401-recovery-records` ref, owned by the recovery task/coordinator, with no automatic expiry. Do not merge it into product history. [Original source, historical receipts and three genuine rendered-document images remain retained](../pr401-recovery/README.md); their original source and evidence refs are untouched. This record supplements, never replaces, those identities.

To reproduce the observation on the verified host, use detached baseline/final checkouts named inspect-master and release-entrypoints below a scratch directory, save the retained harness beneath assessment-data, and invoke Node from that directory. Its existing YAML dependency path and Git Bash path are explicit in the harness; no install is performed. The source tests run with npm run test:release, test:native-release, test:deploy, and release:check in the final checkout. Exact retained artifact bytes are bound by [manifest](manifest.json); linked source commit identities bind maintained helpers and fixtures. Source and fixture imports are not copied into this evidence archive.
