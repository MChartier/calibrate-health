# Visual review - September 15, 2026

## Approved expansion navigation

The user approved the designer-reviewed expansion mock before implementation. Food log now grows
below Today's retained date picker; Trend and Plan check grow below Progress's app bar. The shared
pane keeps the existing shell, moves surrounding sections away, and reverses into the mounted
overview on collapse. Detail content crossfades with its source while the pane changes size; text
and charts are not scaled. A pinned Collapse control, Escape, native Back, and browser Back/Forward
provide return paths. Existing direct detail URLs remain available.

Designer readback of actual phone, tablet, and desktop renders found the final geometry consistent
with the mock. The initial blank interval identified during motion review was corrected by fading
the whole pane together with its source. Regression coverage checks actual animation frames,
retained date/shell bounds, scroll and keyboard focus restoration, nested Add food dismissal,
browser history, resizing, enlarged text, and expanded-content accessibility. Physical-device
animation, screen-reader behavior, keyboards, and insets remain unverified.

Validation: Expo type-check and web export passed, along with 956 mobile tests, 16 web release checks,
and the normal UX gate (239 passed, 71 viewport skips). The broader browser run passed 155 checks;
its one update-notice interception was corrected using the existing notice-suppression helper.
The final expansion/history rerun passed all 19 applicable checks across four viewports (nine skips),
and the final native Back/Progress component rerun passed all six checks. Nine intentional visual
baseline changes were reviewed before updating. The [PR screenshot gallery](../.github/pr-screenshots/page-expansion/README.md)
contains 12 inspected implementation renders. Its fresh capture run passed all 11 applicable
expansion checks across four viewports, with nine intentional project skips.

### Motion refinement - September 17, 2026

The user identified premature clipping of the weight row and an interrupted handoff between two
bottom button bars. The weight row now travels through its original body boundary and clips only
beneath the date header. Today retains one action dock: Add food grows horizontally while Complete
day slides right out of view, reversing on collapse. Enlarged text keeps full-width buttons and
collapses the vacated second row. The persistent primary action is briefly blocked during motion
so opening Add food cannot race the pane's focus handoff.

The designer approved this geometry and identified the interaction/focus race addressed above.
Validation for the refinement: Expo type-check/export and dead-code checks passed, as did 12 focused
component tests, 31 Today/food/expansion browser checks (25 project skips), and 21 affected visual
checks (29 project skips). Four legacy Today checks were updated to reset the food-only scroller
and use the approved in-place expansion. Six intended visual baselines were inspected and updated.
The gallery now contains 14 current captures, including paused expansion/collapse frames; the
clipping regression failed before the fix and passes in both directions on desktop and phone.

### Stationary header surface refinement

The user requested a clearer boundary between the navbar and the summaries that slide behind it.
The navbar tint now ends below Today's retained date picker and below Progress's app bar. Daily
balance and Snapshot use the normal page background. The designer confirmed that the existing
clipping boundary now matches this visual separation; no additional border, shadow, or geometry
change is needed. Light and dark renders were inspected. Expo type-check/export, 13 expansion
checks, and 29 affected visual checks passed. The gallery contains 16 refreshed captures including
dark-mode overview evidence; 28 existing baselines record the updated background colors.

The evidence below records the preceding overview redesign separately.

The approved Today and Progress iteration replaces the remaining variable-height overview stack with
full-page compositions. A designer reviewed the responsive mock before implementation. Its final
adjustments preserve the real Calibrate logo and bathroom-scale icon and put food in chronological
order, newest at the bottom. The shared rules are in [visual-design.md](visual-design.md).

## PR handoff

The [review gallery](../.github/pr-screenshots/editorial-refresh/README.md) contains 14 verified
screenshots from the final export. Final checks passed: all TypeScript surfaces, 968 mobile tests,
16 Expo web release checks, 239 normal UX checks (71 viewport skips), and 61 fixed-page/interaction
checks (15 viewport skips). The release export also passed. The lower UX count reflects removal of
the obsolete completion-confirmation overlay. All 16 exported-web smoke checks passed on desktop
and phone. Earlier evidence below retains its original counts.

## Final page refinements

Weight, food preview, and Plan check now extend their actual touch, hover, and focus regions to the
page edges while keeping inner copy aligned. Completed days keep the paired footer positions with
disabled Add food and a dark-green checked Day completed toggle that reopens the day.
Completion applies immediately without a confirmation dialog; its toggle provides the undo path. The detailed
Trend plot grows into the remaining content height and contracts again when the viewport shrinks.
At 320x568 the newest complete food row stays above the dock, and completing a day preserves its height.

Validation after these refinements: Expo type-check and web export passed; all 968 mobile tests across
204 suites passed; the related browser flows passed 63 checks with 21 viewport skips; the normal UX
accessibility/visual gate passed 241 checks with 71 viewport skips. Four changed 320px baselines were
reviewed before updating. Captures for edge hover, completed states in both themes, and growing Trend
plots are under `.codex-screenshots/refinements-regression-final`. Physical-device validation remains
outside this browser/component evidence.

The follow-up removal of completion confirmation passed type-check, web export, 11 food-tracking
component tests, and five browser checks covering one-click completion/reopening across four viewports
and keyboard activation in forced colors. Its obsolete overlay inventory entry was removed.

Trend's heading, fullscreen icon, and graph now share one edge-to-edge navigation target and one
hover/focus treatment. The outdated-estimate Log weight action stays independent. Type-check, web
export, 15 component tests, 22 related browser flows, and 12 targeted visual/accessibility checks
passed. Existing Progress baselines passed unchanged; shared-hover screenshots were inspected at
phone and desktop widths in `.codex-screenshots/trend-target-browser`.

## Approved page model

| Page region | Approved behavior |
| --- | --- |
| Shared shell | Continuous pale top surface, existing logo, header actions, bottom tabs, and desktop rail. Content remains a centered column on larger screens. |
| Today context | One contained date toolbar followed by the open ring/balance arrangement. Keep unavailable comparisons the same size; the goal number stays in Progress. |
| Today weight | Stable full-width Weigh in control above food, changing to the saved measurement/status after entry. The bathroom-scale icon stays; saving or dismissing the local sheet keeps Today visible. |
| Today food | Six chronological meal summaries fill available height; keep whole-meal totals and food-only scrolling when needed. Tapping expands the detailed log below the date picker. |
| Today actions | Anchor Add food and Complete day as a filled/outlined pair. Completion keeps Add food disabled beside a green checked Day completed toggle; toggle it off to reopen. Paused tracking uses Resume tracking. Pause lives in the date/day controls. |
| Progress context | Compact Snapshot retains weight, goal date, goal progress, target, and direct goal editing. |
| Progress middle | Trend fills the available space and expands in place for its detailed chart. |
| Progress bottom | A compact Plan check diagnosis/state expands in place for evidence, recommendations, and scheduled-change actions. |

`FixedPage` measures the space inside the real app shell instead of estimating it from window height.
Normal-sized controls keep stable geometry while food and the chart use the remainder. At 320x568,
Progress scrolls Snapshot, the complete chart, and Plan check together; the diagnosis follows below the
fold. Enlarged text allows rows and action pairs to grow and the page to scroll. Short screens, insets,
and notices must never clip content or hide essential actions to preserve a fixed-height appearance.

The prior three-box date bar, rounded balance card, separate day-status block, full evidence on the
Progress overview, and direct Add food action on completed days are superseded by this approved model.
Tracking calculations, confirmation/quantity flows, and other surfaces retain their existing behavior.

## Current implementation evidence

A designer compared the production renders with the approved mock and found no blocking visual
mismatch. Readback covered 320x568 and 390px phones, an 820px tablet, and 1024/1440px desktop layouts
in light and dark appearance. The short Progress chart retains its complete plot and axes, with Plan
check following below the fold. Today keeps the latest meal/item visible at 320px and preserves its
completion dock, real logo, and bathroom-scale icon.

Current checks:

- Expo client type-check and web build passed.
- Mobile tests: 968 passed across 204 suites.
- Thirty changed renders were inspected before the guarded snapshot update. The normal UX gate then
  passed: 241 checks, with 71 intentional viewport skips. Coverage includes the new Plan check detail
  route and complete-day confirmation accessibility.
- Fixed-page flow checks: 41 passed, with 15 project skips.
- Applicable existing Today checks: 24 passed, with four skips.
- Current Today/Progress/Plan check data-state and route-inventory checks: 19 passed, including the six
  Plan check states.
- The 320px/200% text Today action screenshot was inspected: Add food and Complete day stack at full
  width while preserving their padding and labels. Forced-colors keyboard navigation also passed.

Stale Plan check metadata now identifies a failed refresh, and the loading dock keeps its actions
disabled until their state is known. These states retain the page structure without implying that
unavailable information is current or that an unresolved action is ready.

Current screenshots are under `.codex-screenshots/`, including `fixed-today-390-light.png`,
`fixed-today-320-light.png`, `fixed-progress-390-light.png`, and `fixed-progress-320-light.png`.
The enlarged-text action readback is
`.codex-screenshots/fixed-page-large-text-final/fixed-page-layout-320px-To-a1e4f-text-without-losing-actions-compact-phone-chrome/today-200-text-actions.png`.
Reviewed regression images remain in the repository's UX snapshot directory.

Physical-device software keyboards and native insets were not verified in this iteration. Browser
rendering and component tests do not establish those native runtime results. No API, database,
calculation, or server-version changes are included. The evidence below records the preceding
cross-surface revision separately.

## Earlier cross-surface review scope

- All 37 canonical routes and 26 registered overlays, captured at 320, 390, 820, and 1440 logical pixels
  in light and dark appearance. Each capture includes the top, bottom, and target/overflow measurements.
- Today and Progress, including the daily states, goal controls, Plan check, date calendar, weight
  entry, saved-weight receipts, and detailed trend.
- Food log, search and amount confirmation, Saved foods, food/recipe editors, barcode and label recovery,
  copy/save meal sheets, ingredient pagination, and dirty-draft protection.
- Settings categories, profile/preferences, devices, connected assistants, notifications, integrations,
  About/Advanced, account data and deletion, auth/recovery, onboarding, and public/legal pages.
- Shared button, selector, stepper, recovery-screen, notice, and header behavior, including keyboard
  focus and 200% text. Wear's separate interface is outside this refresh.

## Earlier cross-surface findings addressed

| Area | Correction |
| --- | --- |
| Grouping | Supporting pages use headers plus section rules. Diagnostic and routine form frames are removed. Today and Progress now follow the approved page model above. |
| Recipe editing | Serving and unit fields wrap at narrow widths; Remove stays with quantity; totals have one divider; initial ingredient results are bounded to six with search and Load more retained. |
| Saved foods | Balanced creation controls and a separate Scan label action preserve direct access. Edit and Pin remain independent row targets. |
| Tracking tools | Barcode controls regain spacing; recovery states use consistent form widths; chart utilities have physical 48px targets. |
| Settings and account | Readable stacked summaries, clear section boundaries, quieter record actions, accessible notices, and wrapping integration controls. |
| About links | Flattened Link-as-child styles restore row alignment, dividers, 48px targets, and interaction feedback. |
| Enlarged text | Long header titles move below navigation controls; measurement fields grow and move their units below the value; action labels wrap; recovery pages scroll. |
| Control feedback | Steppers and server controls use shared focus/press treatment; disabled-option explanations and disabled busy indicators retain contrast. |
| PWA notices | Persistent update errors clear the desktop app bar, can be dismissed, and do not block notification navigation. |
| Appearance | Public pages now reconcile exported light styles with the browser preference during hydration; direct dark entry and subsequent appearance changes are verified against actual content colors. |

## Earlier evidence and limits

The reproducible atlas is generated by `e2e/expo-web/design-review.spec.ts`; local captures are under
`.codex-screenshots/final-design-audit`. Reviewed regression images remain in the existing UX snapshot
directory. The atlas suppresses incidental update notices; dedicated PWA checks exercise their real UI.

Checks completed before the current page-layout iteration:

- Expo client type-check and web release export passed.
- Mobile tests: 944 passed across 201 suites.
- Normal UX gate after reviewed baseline updates: 237 passed; 71 intentional viewport skips.
- Atlas: 504 passed, with no horizontal overflow, appearance mismatches, or light main surfaces in dark captures.
- Tracking/account keyboard flows and the route data-state matrix passed after updating stale Preferences
  navigation and route-inventory test contracts. Focused regressions cover public dark hydration, long
  headers and weight input at 320px/200% text, and dismissible update notices.
- Diff hygiene passed. The live local Today page loaded successfully after the changes.

Normal-size geometry found no horizontal overflow in the captured surfaces. The seven-column historical
calendar is a dense-control exception at 320px: its day targets are approximately 41x48px. Its month
navigation and all other measured buttons/fields meet the 48px target. The calendar was preserved rather
than replacing the familiar month view during this pass.

Browser rendering validates the shared phone/tablet/web layouts. Native weight input also has a 200%
font-scale component regression check. Native software keyboards, physical-device insets, Health Connect,
and watch pairing require a connected target. Final ADB inspection reported only an offline emulator,
and no configured AVD was listed, so no usable target was available. Browser screenshots do not establish
those native runtime results.

No API, database, calculation, server-version, or release-publication changes are part of this pass.
