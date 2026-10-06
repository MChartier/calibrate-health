# PR434 terminal CI and published scope readback

Checked 2026-10-06 after all five workflows completed successfully. Head 9f8359c428a6e29dc0e5d8661636fb851035299e; actual target/base/merge-base master 6b803fbc5ecd833cc4de5039e8ce495812a97e86. Open draft, one commit, seven files, +371/-14; exact paths/parents match README.md. No product/evidence files changed after testing.

- Builds: https://github.com/MChartier/calibrate-health/actions/runs/37513584699
- Tests: https://github.com/MChartier/calibrate-health/actions/runs/37513584848
- Lint: https://github.com/MChartier/calibrate-health/actions/runs/37513584743
- Container scan: https://github.com/MChartier/calibrate-health/actions/runs/37513584647
- Database Upgrade: https://github.com/MChartier/calibrate-health/actions/runs/37513584705

Jobs: 10 success, 14 scoped skips. Successful jobs include release configuration, mobile tests, typechecks, container scan, Expo web build, critical web smoke and four classifiers. Skips are unchanged scope decisions: backend/database jobs unaffected by this tooling patch, native/platform fan-out and manual-only exhaustive suites. This implementation PR is not a canonical release candidate; its scoped skips are not an input to the new release gate.

Retained original evidence README Git blob c16d6a721a57d5cb30b0fa717c402aeddd929e2d was independently matched to the GitHub API. Original record remains immutable at commit 31bbc61e7554dfc4f074b414998fba11d5131fd1.

Independent engineering review/QA is pending; no human-ready claim. No GitHub bot review was requested or claimed. Issue433 links the implementing task ID and PR434; PR uses nonclosing Refs #433 for the bounded implementation. API closingIssuesReferences and projectItems are empty: a nonclosing mention is not a native closing association. Coordinator must reconcile Project Current PR/native partial linkage as supported. No unrelated board edits were made.
