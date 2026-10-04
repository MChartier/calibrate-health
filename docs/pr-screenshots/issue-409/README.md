# Issue 409: goal pace continuity evidence

The actual pre-change Progress editor creates a replacement goal when changing pace. The new **Adjust pace** action keeps the existing goal; **Set a new goal** remains an intentional reset. These captures use synthetic data only, with no supplied personal screenshot.

## Genuine source comparison

[Matched source evidence and provenance](before-after/README.md) compares actual separately built sources: before `230c31f120d27811228ed566f7dbb0ff6106288a` and after `f500688c379f7e57de273a943972d1e507f7de1d`. Four matched capture tests passed across desktop light and phone-sized browser dark. Both sources start with goal 7, January 1 start, 90 kg baseline, 75 kg target, current 85 kg, 500 kcal/day deficit and 33% progress. The old editor's save changes identity/start/baseline and yields 0%; the new editor preserves them and yields 33%. Both update the fixture calorie target to 2350 and projected date to May 25, 2027. Response readbacks and screenshot hashes are archived.

## Behavioral flow evidence

The sibling PNGs are actual Chrome on Windows rendering the current Expo web app with synthetic API fixtures. Project names containing android-phone describe browser viewports, **not Android emulator/device execution**. Names ending `before` mean initial state of the current implementation's flow; only the separate `before-after/` directory contains pre-change source captures.

All eight light/dark flows at 320, 390, 820 and 1440 px passed. `e2e/expo-web/goal-pace.spec.ts` exercises adjustment, cancel/discard, a simulated lost response after commit, retry with the same operation ID and one write, reload/reopen, Escape focus restoration, historical saved target, and separate explicit new goal. The 320px light scenario also reaches Save/Close at 200% text. Axe checks the changed editor. The API fixtures demonstrate UI behavior; backend and real Postgres checks separately establish persistence and safety.

Screenshots follow `before / draft / retry / after / historical-balance / new-goal / new-goal-saved`. Representative desktop-light and compact-dark states, tablet/phone drafts, historical balance and enlarged controls were visually inspected. The matched originals were inspected for visible 85 versus 90 kg baseline, 0% versus 33%, target2350, original start in the full draft editor, theme, wrapping and reachable actions.

## Persistence and history policy

Nullable `configured_daily_deficit` on `CaloriePlanRevision` distinguishes manual pace from calibration. The original Goal scalar remains the legacy baseline; the shared resolver applies the latest effective manual pace. Changes apply on the user's current local date, same-day ties use revision ID, and completed days retain their first-completion comparison snapshot. Older unknown targets stay unknown. A manual change starts calibration evidence on the next full local day. Historical and scheduled calibration records remain stored; all prospective correction combinations are safety checked and pending recommendations become stale. Serializable mutations, expected-plan fingerprints and operation receipts protect retry/concurrency. Account export format v10 includes the required nullable pace field in serialization, OpenAPI and generated/client types. Release versions remain unchanged.

## Reproduction and limitations

Run the repository setup, `npm.cmd --prefix mobile run build:web`, then `npx.cmd playwright test --config playwright.expo-web.config.ts e2e/expo-web/goal-pace.spec.ts`. Set `CALIBRATE_PACE_EVIDENCE_DIR` to save the complete flow PNGs. Matched capture instructions are in the linked directory.

Local live Postgres and native emulator/device execution remain unexecuted. Docker was unresponsive; a repository status command attempted Desktop startup and was interrupted, with no subsequent shared-service recovery. The Database Upgrade CI workflow runs an isolated-schema real Postgres route smoke plus populated upgrade and rollback. Exact-head CI and configured review results are recorded on the PR, not inferred from browser fixtures.

Stack: parent PR #410, pinned `230c31f120d27811228ed566f7dbb0ff6106288a`; base branch `mchartier/completed-calendar-bands`; child `mchartier/goal-pace-continuity`. Review parent first, then #409. Execution workflow-v3 remains pinned `f0919b184b6344d6279178b2388190936ca432a9`. The coordinator explicitly adopted [pr-review-v3](https://github.com/MChartier/agentic-workflow/blob/97e5583c8355f3673aad0835c0ce3ca1486aeb8b/standards/pr-review.md), which was read in full; its definition is still a draft PR. Independent QA verified product behavior and matched evidence; [the presentation advisory](https://github.com/MChartier/calibrate-health/pull/415#issuecomment-5977169855) requested the presentation-only evidence-pointer correction applied here. See the PR discussion for subsequent verdicts and readiness; this evidence is not a human-ready verdict.

## Review follow-up

Configured Codex review identified two valid gaps: goal-creation serialization conflicts needed a structured recoverable response, and account-export pace provenance needed a versioned complete schema. Both are corrected with regression coverage. The database smoke now names its backend-scoped loader `backendRequire`, matching existing repository scripts without weakening Knip or adding dependencies. A subsequent same-goal conflict fix resets the stale draft to the authoritative pace before Save is enabled. Its focused component regression passed; all eight browser flows passed again. After captures were refreshed from that final product source; the earlier provenance remains preserved at its original immutable commit. Final CI/review identities are recorded on the PR.
