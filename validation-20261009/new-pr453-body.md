## Summary

Future Firebase account deletion spans two stores, but current SQL deletion cannot recover an interrupted provider operation. This checkpoint adds an internal coordinator that retains account data until the bound provider identity is confirmed absent, then commits SQL cleanup and a surviving receipt together. Recent authentication binds intent to the account and security version; pending intent fences access, retries and stale workers.

Firebase stays disabled, with no real provider adapter or production caller. Existing local-account behavior remains unchanged. Closes #451; parent #421 remains unfinished.

Targets master; prerequisites PR431, PR437 and PR442 are human-merged. Head `c62450c7` has the same own-parent patch and 23 changed blobs as the originally reviewed deletion change. Its parent/API base is `8eb6014a`; actual master is `547206a1`. The historical replay executor remains unknown. [Exact source bindings and retained originals](https://github.com/MChartier/calibrate-health/blob/46bf9f89f01a5f2bfd86368218b872367c58b333/validation-20261009/README.md#source-and-reproduction-identity).

## Test plan and behavior evidence

This is a non-UI dormant protocol; observable PostgreSQL state and synthetic provider results are the appropriate evidence.

| Scenario | Expected and observed |
| --- | --- |
| Provider timeout/lost response, process crash, stale claim or rollback | Data and operation identity survive uncertainty; only confirmed absence permits cleanup. The maintained PostgreSQL suite passed **23 tests, zero failures/skips**, on the synthetic current-master combination. [Output](https://github.com/MChartier/calibrate-health/blob/46bf9f89f01a5f2bfd86368218b872367c58b333/validation-20261009/maintained-deletion-postgres.log). |
| Metric, weight-import or Wear writer holds the account lock first | PostgreSQL reported deletion waiting; weight, eligible goal, sync and supported receipt state committed before intent. [Observed blockers and results](https://github.com/MChartier/calibrate-health/blob/46bf9f89f01a5f2bfd86368218b872367c58b333/validation-20261009/ordering-results.json). |
| Deletion intent commits first; writer aborts, retries or replays | Pending writers left no partial state. Injected aborts rolled back; retries/replays did not duplicate changes. Ordinary local accounts remained writable. [Harness and output](https://github.com/MChartier/calibrate-health/blob/46bf9f89f01a5f2bfd86368218b872367c58b333/validation-20261009/README.md#observed-behavior). |

These results come from an isolated synthetic tree combining this patch with master, **not execution of the published head or independent QA**. Actual handlers/Wear service were exercised with synthetic identities, bypassing HTTP authentication middleware. Imports contained weights only; food writes outside that transaction are unassessed. Import has no operation receipt. Pending writes returned metric-handler 500 or import/Wear P2010; runtime error presentation is unassessed. [Exact commands, hashes, setup and cleanup](https://github.com/MChartier/calibrate-health/blob/46bf9f89f01a5f2bfd86368218b872367c58b333/validation-20261009/manifest.json).

## Supporting checks and limitations

All five current-head CI workflows passed, including [backend tests](https://github.com/MChartier/calibrate-health/actions/runs/37872176048), builds, typechecks, database upgrade/rollback and image scanning; unrelated client/device jobs retained configured skips. The [original 811-test suite and supporting checks](https://github.com/MChartier/calibrate-health/blob/46bdafe01bdc9c66f1ad4cf4ea63566eb4ca8981/handoff.md) and [independent 25-test QA](https://github.com/MChartier/calibrate-health/pull/453#issuecomment-6070919502) remain historical at their original revisions. They were not rerun or relabeled for the synthetic combination.

The [bot returned a quota-only refusal](https://github.com/MChartier/calibrate-health/pull/453#issuecomment-6070605496); it did not complete a current-head review. Same-owner independent QA must reassess the final narrative and applicable evidence before readiness.

No real Firebase rehearsal, live accounts, credentials, activation, public pending API, client cleanup, receipt purge policy, provisioning, deployment or release is included. The coordinator remains deliberately dormant; synthetic checks do not establish migration readiness.
