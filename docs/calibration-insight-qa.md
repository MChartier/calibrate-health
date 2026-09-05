# Plan check QA

Use the shared Calibration history lab to validate the exact product component rendered on Progress.

## Commands

```powershell
npm run dev:calibration-lab
npm run test:dev-script
```

To replace reviewed screenshots while the lab is running:

```powershell
$env:CALIBRATE_CAPTURE_SCREENSHOTS='1'
npm run capture:calibration-lab
```

Screenshots are written to `docs/screenshots/plan-check/`.
The reviewed set includes all 19 deterministic scenarios, the desktop adjustment review, compact card and review layouts, and the waiting state at 320px. Client tests also verify stacking at a 1.6 font scale.


## State coverage

Review every lab scenario, with particular attention to:

- Waiting with short history
- Waiting after a tracking pause
- Waiting for more weights or a current weigh-in
- Waiting because the trend range is too wide
- On-track loss in kilograms and pounds
- Maintenance and gain
- Slower and faster off-track conclusions
- Off track with a target adjustment
- Off track with no target change
- BMR-capped and safety-blocked changes
- Scheduled update and Undo
- Maximum 42-day evidence window

## Product assertions

Waiting must not show:

- Available now
- Confidence still building
- Progress bars or day-count milestones
- A provisional trend midpoint or range
- Estimated calorie balance
- Expected change from food logs

Mature states must show:

- Plan check heading
- One completed evidence period
- Recent weight trend and likely range
- Your goal
- A clear on-track or off-track conclusion
- A target decision
- The visible statement that the trend is not a forecast

The product card must not render legacy headline, summary, nextStep, or missingCriteria prose.

## Adjustment review

Confirm that:

- The card has only Review adjustment
- Apply is absent until the review sheet opens
- The sheet shows trend, range, goal, current target, suggested target, bounded change, and safety floor
- Apply preserves effective-date handling, errors, invalidation, and haptics
- A scheduled update keeps the assessment visible
- Undo restores the pending recommendation

## Responsive and accessibility review

Capture desktop and compact-width layouts. Also inspect large text at 1.3x or greater.

Confirm that:

- Metric rows and actions stack without clipping
- Status never relies on color alone
- The range visualization has one complete spoken summary
- Decorative chart elements are hidden from assistive technology
- Review-sheet focus and Close behavior remain correct
- Error and offline messages are announced

## Validation gates

Run:

```powershell
npm --prefix backend run typecheck
npm --prefix packages/api-client run typecheck
npm --prefix mobile run typecheck
npm --prefix backend test
npm --prefix mobile test -- --runInBand
npm run api:contract:check
npm run test:dev-script
npm run build:expo-web
git diff --check
```
