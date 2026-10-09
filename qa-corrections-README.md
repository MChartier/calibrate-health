# R1/R2 correction evidence

The report records actual synthetic retirement states through the maintained GitHub adapter and journal, plus the real workflow approval/dependency graph. The before log records both newly introduced regressions failing before the fixes; the after log and maintained release suite pass. No live provider was contacted.

To reproduce the observations, place a clean product checkout at `release-447` (head `50f4a84558d9f0750ef2c6a39e82f1652e779024`, with parent objects available), and this evidence checkout at `release-447-published-evidence`, in the same directory. Copy `qa-corrections-reproduce.mjs` into their parent directory and run it there with Node. Inputs are the two retained `qa-corrections-*-scope.json` / `qa-corrections-input.json` files; logs are retained observations, not rerun by the probe.

For maintained checks, run `node --test scripts/release-retirement-github.test.mjs scripts/release-journal.test.mjs scripts/release-operation.test.mjs scripts/release-runner.test.mjs scripts/release-workflow-contract.test.mjs`, `npm run test:release`, and `npm run release:check` from the product checkout. On Windows use `npm.cmd`. The affected OTA workflow was linted with actionlint 1.7.12 and `-shellcheck= -pyflakes=`; its sole raw diagnostic is the existing documented GitHub Cloud `queue: max` schema gap.

Prior evidence remains unchanged at its original commit-addressed links. This ref is evidence retention only and must never be merged into product history.
