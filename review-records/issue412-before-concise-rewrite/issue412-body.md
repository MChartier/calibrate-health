## Problem and value

Notifications are timely prompts to log food or weight. The user wants the separate archive of past reminders removed because resolved/dismissed reminders are no longer useful actions. Remove the historical-notifications screen and its entry points while keeping current reminders useful in the notification side panel.

This is an intentional product simplification, not a claim that reminder delivery is broken.

### Evidence and limits

Source inspected at master `29fb444ae4389ca81f3437d24685ed9badc43410`:
- [The /notifications route](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/app/%28tabs%29/%28today%29/notifications.tsx) renders [NotificationHistory](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/notifications/NotificationHistory.tsx), which fetches `view=history`, paginates older notifications, shows historical status, and offers mark-all-read and preference/delivery controls.
- [NotificationsDrawer](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/components/NotificationsDrawer.tsx) displays up to five active reminders and a **View all notifications** button; [the app shell](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/app/%28tabs%29/_layout.tsx) wires that button to the history route.
- There is one additional history shortcut: [the signed-in public legal-page header](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/components/legal/PublicLegalPage.tsx) pushes `/notifications` from its bell.
- Reminder schedules, opt-ins, quiet hours, and delivery/permission recovery already have an independent home in [Settings ╬ô├▓┬╝Γö£Γöñ╬ô├╢┬úΓö£├ª╬ô├╢┬úΓö£├æ Profile & preferences ╬ô├▓┬╝Γö£Γöñ╬ô├╢┬úΓö£├ª╬ô├╢┬úΓö£├æ Preferences](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/app/%28tabs%29/%28settings%29/preferences.tsx). The history page is not their only access path.
- [Typed route metadata](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/navigation/routeRegistry.ts) registers history as a Today child. Existing [Goals compatibility redirect](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/app/%28tabs%29/%28progress%29/goals.tsx) and route aliases provide a small replacement-navigation pattern.
- The two privately supplied screenshots were inspected during intake: the full history list includes resolved/dismissed reminders, while the empty side panel still offers View all notifications. They contain personal information and are not uploaded here.

Intake used source inspection and supplied screenshots. No application run, new test execution, or implementation is claimed.

## Intended outcome and scope

1. Remove the historical-notifications screen: no history list, pagination, historical status UI, mark-all-read archive action, or historical route title/metadata.
2. Remove **View all notifications** from every drawer state and remove its callback wiring. Remove the legal-page header shortcut that directly targets history; preserve its Back to Settings and Account & settings actions. Keep the normal app-shell reminder bell and side panel.
3. Treat `/notifications` only as a legacy compatibility address: replace it with `/today` using the existing redirect/alias pattern, without mounting history, querying history, or adding a redundant Back-stack entry. Preserve existing authentication/onboarding/account-access gates. Unknown deeper paths continue through existing not-found recovery. Do not introduce another notifications page or replacement archive link.
4. Preserve current active-reminder behavior: unread badge, five-item quick list, food/weight actions and local-date routing, dismiss/read reconciliation, new-arrival refresh, SSE/push invalidation, loading/empty/error/offline presentation, busy-state protection, guarded navigation, Close/Escape/Back/backdrop dismissal, and focus restoration. Removing the archive is not a drawer redesign or a change to active-reminder selection/limits.
5. Preserve the existing Preferences route and all reminder/delivery controls. Remove duplicated controls with the history screen; do not duplicate or relocate the remaining settings unnecessarily. Retarget relevant permission/recovery tests to Preferences when coverage would otherwise be lost.
6. Remove demonstrably dead history-only client code and tests. Candidates include `NotificationHistory.tsx` and its tests, history pagination/key/cache branches and read-all reconciliation in [notifications/query.ts](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/notifications/query.ts), `showHistoryState` and unused history formatting in [NotificationCard](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/mobile/src/components/NotificationCard.tsx) / `notifications/presentation.ts`. Keep the active query key, read/dismiss reconciliation, shared card, routing, and push-registration helpers still used elsewhere. Search consumers before deleting.
7. Update route registry/metadata expectations, notification/drawer/public-legal-page tests, [notification-center E2E](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/e2e/expo-web/launch-17-notification-center.spec.ts), route/nested-stack matrices, and the history-specific case in `e2e/expo-web/launch-24-data-state-matrix.ts`. Retain current-reminder, recovery, accessibility, and permission coverage rather than deleting the entire mixed-purpose suite. Reconcile stale current documentation and relevant visual expectations; preserve historical release/evidence records and existing privacy/delivery guarantees. Remove client history-only diagnostic callers if unused; do not break a shared telemetry contract merely because one UI disappears.

### Non-goals and compatibility

- **Do not delete stored notification records, change retention, run a cleanup migration, or change account export/deletion/privacy behavior.** The [notification delivery ADR](https://github.com/MChartier/calibrate-health/blob/29fb444ae4389ca81f3437d24685ed9badc43410/docs/architecture/0005-notification-delivery.md) identifies in-app records as canonical reminder state.
- Keep backend notification endpoints, history/read-all compatibility, API-client/public schemas and old-client behavior intact. This issue removes a client history experience, not the server notification API.
- Do not remove timely reminders, alter schedules, permission prompts/registration semantics, subscriptions, push delivery, phone/watch coordination, safe action URL handling, or notification preferences.
- No broad navigation/settings cleanup, active-drawer pagination redesign, release/version changes, merge, release, or deployment.

The redirect destination and removal of the extra obsolete shortcut are bounded, reversible implementation decisions. No additional product decision is required to begin after coordinator admission.

## Acceptance and validation

Requirements for implementation; all checks below are currently unexecuted:

- [ ] From Today, Progress, and Settings, open the normal notification side panel with empty and populated synthetic fixtures. View all notifications is absent, including loading/error/offline states, with no dead focus target or blank footer. The shell bell, badge, content, and dismissal still work.
- [ ] With more than five active synthetic reminders, the existing five-item quick-list limit and global unread count remain correct. Opening or dismissing a reminder updates the active list/badge and subsequent refetch correctly. Read/resolved/dismissed history never becomes an archive UI.
- [ ] Food and weight reminder actions still open the intended logging destination and local date. Test repeated clicks/taps, close/reopen, browser Back/Forward, and native Back where applicable. A canceled unsaved-change guard preserves the draft and current navigation; no history route or stuck modal is introduced.
- [ ] Direct-load/reload/bookmark `/notifications` (including stale query/hash variants) resolves to Today after normal account gates. Repeated Back/Forward cannot reopen history or loop through a redirect. Signed-out/restricted sessions do not bypass their gate. An unknown nested address retains usable not-found recovery.
- [ ] Signed-in legal pages no longer expose the obsolete history shortcut; their remaining navigation works. Settings ╬ô├▓┬╝Γö£Γöñ╬ô├╢┬úΓö£├ª╬ô├╢┬úΓö£├æ Profile & preferences ╬ô├▓┬╝Γö£Γöñ╬ô├╢┬úΓö£├ª╬ô├╢┬úΓö£├æ Preferences remains reachable and retains food/weight switches, timing/quiet hours, permission-required/blocked/unsupported/error/retry controls, and existing save/cancel behavior.
- [ ] A new reminder arrival and controlled read/dismiss/fetch failure preserve honest badge/list state, error/retry handling, and recovery. An unavailable request must not show false ╬ô├▓┬╝Γö£Γöñ╬ô├╢┬úΓö£┬║╬ô├╢┬╝Γö£ΓòæAll caught up╬ô├▓┬╝Γö£Γöñ╬ô├╢┬úΓö£┬║╬ô├╢┬╝Γö£├ª reassurance. Cached/offline behavior remains consistent, with no history fetches or history-only mutations from the removed UI.
- [ ] Native push-response routing and browser notification actions remain protected by focused regressions. Unknown/unsafe action URLs keep their existing safe fallback. Do not claim real push delivery from a mocked tap harness; record native/emulator/device checks and delivery limitations accurately.
- [ ] Verify keyboard order, screen-reader labels/modal semantics, focus return, reduced motion, and small/large viewports in light/dark mode. Exercise the actual application with synthetic fixtures and inspect **before/after screenshots** of the side panel (empty and populated), plus legacy-route recovery and continued Preferences access. Do not publish the user's private screenshots or account data.
- [ ] Run focused drawer/card/query/route/public-legal/settings/notification-workflow tests; update affected browser route/data-state/E2E checks. Run applicable repository typechecks, production Expo web export, dead-code checks, smoke/UX gates, and final-head CI. Useful existing commands include `npm run lint`, `npm run test:mobile -- --runInBand`, `npm run build:expo-web`, `npm run test:dead-code`, and `npm run test:web:e2e -- <affected specs>`. Follow the current checkout's test-selection guidance; report passed, failed, skipped, and unexecuted checks separately.
- [ ] The eventual PR follows [pr-review-v2](https://github.com/MChartier/agentic-development-workflow/blob/f0919b184b6344d6279178b2388190936ca432a9/standards/pr-review.md): problem-first Summary; behavioral Test plan connecting starting state/action, expected outcome, actual observation, revision/environment, and accessible evidence. Commands/screenshots alone are not the explanation. Independent QA reviews that same head and final description.

### Related work and sequencing

No duplicate removal issue or open PR was found in notification/history/removal searches on 2026-10-04 UTC. Closed #297 introduced history; this request supersedes only its archive/entry-point product requirement.

Open #402 touches route registry/settings/fixtures; #404 touches documentation/test guidance. Reconcile their current changes before editing shared files without absorbing their unrelated work. #410 implements #408's calendar change; #409 currently owns the sole implementation slot and is based on #410. Neither is a dependency for this UI removal. Queue this candidate for coordinator admission and later dispatch; do not launch a second implementation or invent a stacked dependency. Recheck current master, open PRs, and ownership at dispatch.

## Authority

Direct trusted human request on 2026-10-04 UTC, preserved verbatim:

> Historical notifications view in calibrate-health is pretty much pointless. Notifications are just meant to offer timely reminders to log weight or food, so past notifications aren't actionable or interesting.
>
> Get rid of this route and the entry point to it in the notifications side panel.
>
> Scope this out as a github issue for delegation.

This issue records the requested bounded removal for delegation. It does not authorize underlying data deletion, merge, release, or deployment.

## Workflow current state

Current implementation: draft [PR #427](https://github.com/MChartier/calibrate-health/pull/427), head `c5f149a516cbd8733b02fffa4ebf22630db6611d`; actual master/base/merge base `acc8a30d6cde7477f08f0b7ace23df4047d21354`; branch `mchartier/remove-notification-history-clean`; independent, no PR parent. Final body SHA256 `23414eaa8dc96ad1904ae8a7e831c409cc9f235cd0b77b77e56a1efdb5d3db8d`. [Final owner checkpoint](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004359120).

Sole implementation owner task `01a105d0-2544-70b1-813c-cf8460fd70c6`, native MCHARTIER_ZBOOK, is clean/idle and retained for fixes. Execution workflow-v3 remains pinned to `f0919b184b6344d6279178b2388190936ca432a9`; communication pr-review-v3/queue-v1 at `97e5583c8355f3673aad0835c0ce3ca1486aeb8b`. Human focused-diff, final-state, capacity and complete-published-scope amendments are acknowledged; no runtime migration.

The replacement begins directly on actual master including merged #410/#416. #423 was assessed at 7ff6937c9cd43fea1e239b537b6f77adfcbf1dda with no changed-path overlap; adjacent auth/outbox behavior is an integration consideration, not a dependency. The complete published ordered history, parents, per-commit paths and live PR totals reconcile to **1 commit, 30 files, +973/-1129**: 12 product files, 17 maintained test/fixture files and five maintained documentation lines. No evidence churn enters product history. [Complete scope audit](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004219698).

Behavior: history UI/entry points are removed; /notifications replaces with /today through normal gates. Timely reminders, Preferences, backend APIs and stored records remain. Guard cancellation preserves the reminder/draft; accepted pending reads remain modal; failed reads preserve edits and recover; offline mutation and paused-query refresh no longer leave accepted opens stuck.

Current-head local validation: 212 mobile suites / 1,084 tests; 144 affected browser cases / 4 opt-in capture skips; 11 compact-rail checks; phone Settings 1 / 1 opt-in skip; UX 250 / 79 existing skips; typechecks, production export, dead-code, and 16 release/static-route contracts pass. Exact-head CI: five successful workflows, 11 successful jobs / 14 configured scope skips. The single authorized configured-review recovery request completed on this head with no actionable findings: [result](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004271926), [completed summary](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004225537). The old #417 quota block is historical; it is not the current review state.

Fresh evidence: six genuine actual-master-to-final screenshot pairs, source/build/fixture/capture/image bindings and sanitized logs at `dd9b611ded286189cb1d49e2f202638061d5048c`, retained on `refs/heads/evidence/issue412-master-c5f149a`; [manifest](https://github.com/MChartier/calibrate-health/blob/dd9b611ded286189cb1d49e2f202638061d5048c/review-evidence/issue412-master-replacement/manifest.json), SHA256 `a02ac566c28de305d5e13af01d382277cfdfc4306d72385988d3016bcec10958`. All 44 artifacts, 39 source bindings and four original manifests were publicly digest-verified. Twelve images are visibly embedded and inspected in the final rendered PR.

Original #417 remains open/draft/unready at `123bab9e5c0e79e0fd6a0f024126c954b9bde08e`, with its body, branch, four evidence refs and historical review/QA receipts unchanged. [Retention and cross-reference record](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004220122). No force push, deletion or silent closure occurred.

Limits: synthetic browser/API/SSE/permission and mocked native Back/push tests do not prove real-device delivery; no device/emulator/release installation. Independent QA reran the broad Today six-state comparison on actual master and the final revision: both produced 1 pass and 5 failures, and both showed duplicate previous-day Add Food dialogs. These are inherited current-baseline limitations, not introduced fixes or passing checks.

Independent QA remains owned by task `01a1062d-a938-744a-9a70-580866b010d6`; see the [latest revision-scoped verdicts](https://github.com/MChartier/calibrate-health/pull/427#issuecomment-6004791914) and subsequent superseding comments for assessed results and limitations. Coordinator #405 separately owns receipt verification and readiness transitions; QA does not award human approval. Merge/release/deployment remain human decisions. Prior intake, acceptance requirements, admission/assignment comments and earlier receipts remain unchanged historical records; the unchecked acceptance list above records the original requirements.
