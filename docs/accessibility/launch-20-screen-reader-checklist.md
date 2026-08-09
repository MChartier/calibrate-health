# Launch 20 web screen-reader checklist

This artifact separates automated browser evidence from manual assistive-technology work. It does not claim an NVDA, VoiceOver, or TalkBack pass.

## Execution record

| Check | Status | Evidence |
| --- | --- | --- |
| Chromium keyboard and semantic checks | Automated in Playwright | `e2e/expo-web/launch-20-keyboard-accessibility.spec.ts` |
| Windows forced-colors emulation | Automated in Playwright | Desktop project at 1024x1000 |
| NVDA with Chrome or Firefox | Not run | NVDA was not installed on the Windows evidence host on August 9, 2026 |
| VoiceOver with Safari | Not run | The evidence host was Windows, not macOS |
| TalkBack | Deferred | Issue #23 owns Android assistive-technology validation |

Automated browser checks verify focus order, keyboard activation, route focus, modal containment, named controls and groups, progress semantics, Trend chart/table equivalence, forced-colors focus visibility, reflow, and duplicate IDs. They do not replace listening to a screen reader's announcements.

## Manual NVDA or VoiceOver web follow-up

Run this checklist against a release build with a populated deterministic account. Record the browser, screen-reader version, verbosity settings, result, and any deviation from the expected announcement.

1. Sign-in and route focus
   - Open Sign in and confirm the `calibrate` heading is announced once.
   - Traverse Email, Password, Forgot password, Sign in, Create an account, and trust links.
   - Submit an invalid password and confirm the error is announced without exposing request or server details.
   - Activate `Skip to main content` and confirm focus moves to the main landmark.

2. Today food and weight
   - On Today, confirm the route heading receives focus after navigation.
   - Open Add food from the keyboard and confirm `Add food` is announced as a modal dialog.
   - Confirm `Add food method` is announced as a named radio group and arrow keys change its selected option.
   - Close the dialog and confirm focus returns to Add food.
   - Open Weight entry, close it, and confirm focus returns to the Today weight control.

3. Progress and Trend
   - Confirm `Goal progress` is announced as a progress indicator with its current value.
   - Open Trend and confirm the chart is announced once as a named image; axis labels and SVG descendants must not create a second reading sequence.
   - On `Select nearest weigh-in`, use Left, Right, Home, and End and confirm each selected date/value update is announced.
   - Open `View data table` and navigate its dates, scale readings, underlying estimates, and 95% ranges. Confirm the values match the chart summary.

4. Settings and dialogs
   - Open Preferences and confirm it is announced as a modal dialog with its description.
   - Confirm `Weight unit` and `Height unit` are named radio groups. Arrow keys should select and focus one option while Tab leaves the group as one stop.
   - Confirm background app content is absent from the virtual cursor while the dialog is open.
   - Close Preferences and confirm focus returns to its Settings row.

5. Reflow and high contrast
   - At 200% text, repeat Trend table and Preferences checks without horizontal page scrolling or clipped labels/actions.
   - In Windows High Contrast, confirm keyboard focus, selected radios, and progress tracks/fills remain distinguishable without relying on app colors alone.
