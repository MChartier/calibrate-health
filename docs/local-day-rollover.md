# Local-day rollover validation

The log navigation previously memoized today by timezone only. A retained app
session could therefore label yesterday as Today and reject the real current
date until restart.

`useCurrentLocalDate` now shares one foreground timer and lifecycle subscription
across consumers. It checks on minute boundaries (including local midnight in
current IANA zones) and immediately on native activation or browser visibility,
focus, and page restoration. Each check reads the current clock in the profile
timezone, so DST and several suspended days do not require incrementing an old
date. React subscribers update only when their local date changes. Hidden apps
stop the timer, and the final subscriber removes the timer and listeners.

Navigation retains the selected date on forward day rollover. Its label, upper
bound, next-day action, and calendar use the refreshed date. Date route parameters
are applied once rather than continuously overriding manual date navigation.
The tab shell invalidates day-sensitive queries once per local-date change;
entry state and offline mutations are retained.

## Automated validation

Run from the repository root on Windows:

```powershell
npm.cmd --prefix mobile run typecheck
npm.cmd --prefix mobile test -- --runInBand --runTestsByPath src/hooks/useLogDateNavigation.test.tsx src/hooks/useCurrentLocalDate.web.test.tsx src/hooks/useLocalDayRefresh.test.tsx
npm.cmd run test:web:e2e -- --project=desktop-chrome --project=android-phone-chrome e2e/expo-web/local-day-rollover.spec.ts e2e/expo-web/today-add-food.spec.ts
npm.cmd run test:expo-web:release
git diff --check
```

The browser command builds the Expo web artifact before testing. Validation on
October 11, 2026 passed the TypeScript check, all 13 new hook tests, all 14 browser
cases, and all 16 web release checks. Affected existing entry-sheet, navigation,
calendar, tracking-status, barcode handoff, plan-check, and onboarding Jest suites
also passed. Some existing entry-sheet tests emit React act warnings.

Hook coverage includes native resume after one or several days, continuously
active midnight rollover, spring/fall DST and year boundaries, profile timezone
changes, backward clock correction, subscription cleanup, and old route dates.
Browser tests cover active midnight, online/offline resume, updated calendar
bounds, and food/weight drafts retaining both input and submitted date. Native
AppState is mocked in Jest; no native device smoke test was run.

## Screenshot evidence

These are unedited Chromium captures of the built app using synthetic API
fixtures, at 1440x1000 desktop and 390x844 phone viewports. The profile timezone is
America/Los_Angeles. The resume scenario moves the browser clock from July 21 to
July 22 while leaving the app mounted and July 21 selected. The phone viewport
is browser emulation, not a native Android capture.

| Capture | Expected behavior |
| --- | --- |
| [Before resume](screenshots/local-day-rollover/before-resume-phone.png) | July 21 is Today; Next is disabled. |
| [After resume, phone](screenshots/local-day-rollover/after-resume-phone.png) | July 21 stays selected, loses the Today label, and Next is enabled. |
| [After resume, desktop](screenshots/local-day-rollover/after-resume-desktop.png) | The same selected-day and navigation behavior on desktop. |
| [Updated calendar](screenshots/local-day-rollover/updated-calendar-phone.png) | July 22 is today and selectable; July 23 remains disabled. |
| [Food draft](screenshots/local-day-rollover/food-draft-phone.png) | The unfinished 120-calorie snack retains July 21 and its text. |
| [Weight draft](screenshots/local-day-rollover/weight-draft-phone.png) | The unfinished 87.9 kg entry retains July 21 and its input. |

The browser tests also assert the food and weight POST payloads retain July 21
after resume, and that explicit Next navigation reaches the new Today.
