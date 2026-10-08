# Issue 446 retained evidence

Repository: MChartier/calibrate-health. Product base and Before source:
`4cbcbc740fbe5fa5646b4de31951c79a653176d5`. After source:
`eb142dd0bcc527398e83b91d29d4514fd9b4e516` (single parent is that base).
Captured on mchartier_zbook, Windows, October 8 2026. No real account data.
This branch is evidence only and must not merge into product history.

`before.png` and `after.png` are original full-page Chrome browser screenshots
of independently built Expo web artifacts, 1100x900, en-US, America/Los_Angeles,
light theme and reduced motion. Clock fixed to 2026-07-21T19:00Z. Before shows
current weight 85 kg with Start 90 kg and 33% progress; After shows Start 85 kg
and 0%. Both were visually inspected by the implementation owner; independent
QA pixel inspection remains required. GitHub rendering is not claimed verified.

The capture calls the actual selected source's metric route with the retained
synthetic persistence fixture, seeds 90 kg then corrects to 85 kg, and navigates
to the real Progress UI. This is API correction plus UI reload evidence, not a
browser editor interaction, real database integration or native device test.
Goal serialization and unrelated projection date, calorie target and trend data
are fixtures; screenshots do not prove their calculations. PWA transient notices
use the repository's existing suppression helper equally in both captures.
The route response JSON is retained. The regression fixture source and maintained
Expo fixture are included for immutable provenance. Harness import paths reflect
the original sibling checkout layout; restore those paths to reproduce.

Both builds used npm ci and npm --prefix mobile run build:web. Original build
file SHA256 manifests are in build-manifests.json. artifact-hashes.json records
the original images, responses, harnesses, fixture inputs and test logs.
Node 24.19; Playwright 1.61.1, Chrome 154.0.8037.98, device scale factor 1.
Capture files were produced October 8 2026 around 17:56 UTC. Commands:

```
# In each checkout, with TS_NODE_PROJECT set to its backend/tsconfig.json:
node -r ./backend/node_modules/ts-node/register ../evidence446/route-server.cjs . PORT
node scripts/expo-web-static-server.mjs --port WEB_PORT
# Before route/web ports 18446/18444; After 18447/18445
node node_modules/@playwright/test/cli.js test --config ../evidence446/playwright.config.ts
```

Final matched capture: 2 passed (3.2s). Earlier harness attempts failed due to
missing baseline dependencies and reused operation IDs; final capture uses fresh
IDs so it does not replay a prior receipt. Existing operation receipt behavior
is explicitly covered in maintained backend tests.

Maintained validation: 56 focused backend tests (routes-metrics, routes-goals,
client-operations), backend typecheck, 35 client tests (WeightEntrySheet,
GoalProgressCard, replayInvalidation, trackingProjection), both Expo builds and
git diff --check passed. Logs retained where available. Added PostgreSQL
concurrent goal-create/metric-correction case runs in database-upgrade CI.
Local Docker engine unavailable; local real PostgreSQL and native testing unrun.
No readiness, merge, release or deployment assertion is made.

Execution contract: workflow-v3 f0919b184b6344d6279178b2388190936ca432a9;
review-v3 97e5583c8355f3673aad0835c0ce3ca1486aeb8b. Issue plan's exact prior
text preserved at issue446 comment6065685173 (original requirements6065172350).
