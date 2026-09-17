# App visual design

Calibrate uses a near-white page, clear headings, and restrained green emphasis.
The shared tokens own both light and dark palettes and the platform system type scale.

## Grouping and actions

- Use `AppSection` for related information or form fields. It has no surface chrome or implicit action.
- Use `SectionHeader` for a section title, supporting copy, and optional independent action.
- Use `AppActionRow` for a full-width navigation or selection action. Keep independent section headings
  and secondary actions outside the primary target. A single navigation preview may include its own
  label and content in one target, without a duplicate View/Edit link. Rows retain actual 48px geometry,
  keyboard focus, hover, pressed, disabled, and busy states.
- Use `AppNotice` for an important status or decision. Its leading marker and tint identify the notice
  without introducing another floating card. Always include text explaining the state.
- Keep `AppCard` for intentional independent containment, never as the default page wrapper. Inputs,
  selection controls, chart interaction areas, dialogs, and sheets retain their own boundaries.

## Rhythm and emphasis

Design at 320px first. Use 16px phone gutters, 24px wider gutters, 32px between major analytical/form
sections, and 8–12px within groups. Do not retain both card padding and section padding. Screen reading
widths are `overview` (760px), `form` (640px), and `wide` (1040px). Date navigation must use the same
width as its route. Form content and controls reflow at large text sizes. Today and Progress use the
`FixedPage` composition below rather than accumulating generic section gaps.

Use page/section/body/label/metric typography roles instead of custom font sizes. Metrics use tabular
numerals; prose does not. Ordinary buttons are flat. Filled green indicates the principal action for
the current state: Add food on an open Today, Resume tracking on a paused Today, or Save in an editor.
Do not hide existing direct actions behind menus unless the approved flow specifically calls for it.

## Today and Progress page composition

Today and Progress are full-page layouts with stable context, a flexible middle, and a bottom action
or diagnosis area above the existing tabs. `FixedPage` uses the space remaining inside the app shell;
do not subtract guessed header, date, or tab heights from the window. The tabs own the bottom device
inset. Keep normal-size controls stable across data states, but allow content to grow and scroll when
short viewports, enlarged text, or consequential notices require more space. Never clip content to
force a single screen. Large-text action pairs stack. Preserve the desktop rail and a centered reading
column on larger displays; extra room expands the food preview or trend, not a grid of equal tiles.

Use `summaryContainer` as a continuous, full-bleed top surface behind the header and overview context,
with constrained inner content. Preserve the real `CalibrateLogo` and existing bathroom-scale icon.
Bottom tabs retain their destinations and short selected underline. Ordinary food items have no icon
tiles, individual frames, or duplicate navigation decorators.
Full-width navigation rows own the entire page width, including the side gutters, for hit testing,
hover, press, and focus treatment. Constrain their inner content with `FixedPageColumn`; do not extend
a child beyond a narrow parent, since native hit testing would still stop at that parent's bounds.

### Today

- Keep date navigation in one contained, rounded toolbar with separate 48px previous/date/next targets,
  a visible calendar icon at 320px, and a disabled next-day target on Today. Date controls retain date
  selection and provide the secondary Pause tracking action, including its existing confirmation flow.
  Food log, Activity, and Weight use the same unified toolbar, top spacing, and continuous
  `summaryContainer` behind the navbar. Preserve each route's content width and date behavior.
- The open balance region continues the top surface: ring left, quiet divider, balance copy right.
  Do not show the goal number; it remains in Progress's Snapshot. Incomplete, paused, or unavailable
  comparisons retain a neutral ring and the same metric space with status and logged calories.
- Place the full-width weight control immediately below the balance, above food. It begins with
  **Weigh in** and an inviting supporting label, then becomes a measurement with **Logged today** or
  queued-sync status. Never use "No weigh-in yet" as its principal content. Use the existing scale
  icon and a decorative plus/pencil. Tapping opens the weight sheet over Today with the selected date;
  saving or dismissing stays on Today unless View progress is explicitly requested.
- The food summary is one full-width expansion target that fills the remaining body height,
  including blank space below sparse content. Keep the Food log label, food count, and one expand icon
  above six chronological meal-period rows. Each row shows the whole-meal calorie total or neutral
  **No entries**; zero-calorie foods still count as logged. Use the shared 48px row rhythm without
  individual food names, row actions, omission counts, or height-based fitting. A completely empty
  day shows **No food logged yet** and an invitation to add food. Rows retain intrinsic height and
  scroll inside the food pane on short screens, keeping the date, balance, weight, and action dock
  fixed. Extra height expands the tap target, not the spacing between rows. Use the full-page
  fallback at enlarged text sizes or whenever the measured context, minimum body, and footer
  cannot fit in the available shell height. Restore food-only scrolling when they fit again.
  Stack the action buttons only for enlarged text, so the height fallback does not change the
  footer height used to decide whether the fixed layout fits.
- Anchor equal-width **Add food** (filled) and **Complete day** (outlined) controls above the tabs on
  an open day. Add food opens the existing inline search/quantity workflow without navigating away.
  Complete day applies immediately without a confirmation dialog because the action is reversible.
  A completed day retains both positions: Add food is disabled and **Day completed** becomes a dark
  green checked toggle. Tapping it reopens the day and restores the original actions. Incomplete past
  days retain **Edit day**. Keep the paired action heights stable at 320px.
  Paused tracking uses **Resume tracking** in the same action area. Keep incomplete/backfill and error
  recovery available without restoring a separate day-status card.

### Progress

Keep the compact Snapshot in the top surface, with paired weight/date metrics, goal progress, current
target, and direct Edit goal access. Trend's heading, decorative fullscreen icon, and graph form one
full-width tap target with a shared hover/focus treatment. Trend fills the middle and expands in place
when tapped. Its entire chart, axes, and labels must remain visible; do not crop it behind a footer.
The detailed Trend content also gives its plot all remaining height after the range controls, legend,
selected reading, and point navigation. Keep a legible minimum and scroll short screens; do not cap
the plot height while leaving unused space below it.

`PlanCheckSummary` occupies the bottom area as one expansion target: heading, assessment period,
and available diagnosis or a useful pending/building/unavailable state. Keep this area stable when a
diagnosis is absent. Tapping expands Plan check in place; the overview does not contain the full evidence and
recommendation sequence. On short screens, including 320x568, Snapshot, Trend, and Plan check scroll
together, with Plan check following the complete chart below the fold. Enlarged text uses the same
intrinsic scrolling model. A rule marks the lower diagnosis area; do not repeat page rules for every
supporting label or metric group.

The Plan check detail page keeps assessment, paired recent/goal measurements, comparison, and next
step in that order. Group related evidence with 8–16px spacing and separate the next step with a 24px
gap. Use 16px supporting titles, 14px labels, and smaller target values than pace measurements. Keep
the recommendation open and its Review action full-width. Scheduled changes retain their status and
Undo action. Preserve all calculation, data-state, offline, attribution, and confirmation behavior.

### Expansion and return

Food log expands into the shell content below Today's retained date picker. Trend and Plan check
expand into everything below Progress's app bar, above the existing tabs. Preserve the app bar,
desktop rail, tabs, and centered reading width. These are page regions with a pinned heading and
Collapse action; there is no modal scrim or second navigation bar. Direct detail URLs remain supported.

Measure the source region and available pane. Animate its top and height together with the overview
sections moving past the upper and lower edges: 400ms to expand and 360ms to collapse. Crossfade the
moving source and growing detail together, without a blank interval or scaling text and charts.
Reduced motion changes state immediately. Keep detail content scrollable, including at 200% text,
and remeasure the source before collapsing after resize or reflow.

Keep the overview mounted and preserve its scroll position. Hide its controls from interaction and
accessibility while expanded. Focus Collapse after opening and restore the source's keyboard focus
after closing. Escape and native system Back collapse; nested dialogs handle dismissal first. Browser
Back/Forward traverses the expansion without changing the route URL. Food editing, copy, recipes,
date selection, and Add food, plus Trend controls and Plan check review/apply/undo retain their behavior.

## Supporting surfaces

The full Food log retains all six meal periods in chronological order. Empty meals show compact
rows with neutral **No entries** text, matching Today. A logged zero-calorie meal shows its total.
Only populated meals expose expansion, food entries, copy, and save-recipe actions.

Recipe ingredient search starts with six results and retains search and Load more. Keep quantity and
Remove controls together, and put totals below a rule. Saved foods keeps equal Create food/Create recipe
controls and a separate quiet Scan label action. Do not add an extra menu to these flows.

Disabled selection explanations must remain readable; do not fade the entire option row. Busy indicators
must contrast with the actual disabled button surface. Recovery pages must scroll at enlarged text sizes,
and persistent notices must leave navigation reachable and offer dismissal when retry can wait.

Expo Router `Link asChild` merges child styles as objects. Use a flattened style object, with explicit
hover/pressed state if needed, instead of a Pressable style callback that the slot cannot preserve.

## Verification

Run mobile type-checks/tests and `npm run test:ux`. The visual gate covers phone, tablet, and desktop
cross-cuts in both themes, with additional 320px, enlarged-text, forced-color, and data-state cases.
The editorial scenarios include Today, Progress, Settings, authentication, onboarding, Saved foods,
search, amount confirmation, and a six-ingredient recipe. Review actual screenshots before accepting
baseline changes through the existing snapshot update command; do not loosen visual thresholds.

Native runtime evidence still requires a configured Android/iOS target. Browser screenshots and
native component tests do not substitute for software-keyboard and device-inset checks.

For a full human review, the opt-in atlas captures every registered route and overlay at 320, 390, 820,
and 1440px in both themes, including top/bottom views and target/overflow geometry:

```powershell
$env:CALIBRATE_DESIGN_REVIEW_DIR='.codex-screenshots/final-design-audit'
npm.cmd run test:web:e2e -- e2e/expo-web/design-review.spec.ts
```

The atlas waits for client appearance hydration before capture, so a light server-rendered shell cannot
be mistaken for dark-mode evidence. It suppresses incidental PWA lifecycle toasts; dedicated PWA tests
cover notice placement, navigation, and dismissal. It does not replace the regression or accessibility gates.
