# PR410 integrated desktop evidence

Owner: issue 408 implementation owner. Retain on evidence/pr410-integrated-4728d4f. Never merge, rewrite or delete this ref during routine product cleanup. This supplements, and does not replace, evidence/pr410-reviewed-d8e55c.

Validation source 872f7b5f00c5ace203e1d5c1b15b201c84e9dd48, tree d4475f7630894ddd8fe3f87382a075615c182d49, ordered parents 4728d4f75b70e6440a9778a42cd2224a300db725 and 6fadbcc6a6437609ae6e2d49d73ed3da95a94b47. This is a synthetic validation source, not a change to the PR branch. Current-base feature diff remains 24 files +606/-59 and is byte-identical to the original feature diff.

## Observations

All 14 maintained desktop scenarios passed: loss/gain/equality boundaries in both themes, neutral history and other completion states, selection/Escape focus, real food-form edit/recompletion, uncached-month failure/retry, rail routes/keyboard/history/refresh, 1023/1024 transition, enlarged text, offline/notifications and forced-color feedback. Four capture cases also passed; one phone-only test intentionally skipped. No product fix was needed.

Inspected original screenshots: [1440 light](desktop-1440-light.png), [1440 dark](desktop-1440-dark.png), [1023 bottom tabs](desktop-1023-light.png), [1024 compact rail](desktop-1024-light.png). July 9 remains selected yellow, July 17 completed/unavailable is neutral, and date-only badges and legend remain visible. All 31 badge geometries and texts at 1440 exactly match the retained date-only After evidence. The shell changed from 176px to 88px; old desktop images demonstrate the historical date-only change, not the new shell. No replacement matched pair was necessary.

## Reproduction and provenance

Check out the source above, run repository host setup, copy capture.spec.ts to e2e/expo-web/pr410-integration-capture.spec.ts, and copy this directory's fixture to the matching docs path. Run the commands in manifest.json (port setting uses PowerShell environment syntax on Windows). The harness uses maintained fixtures from the exact source commit. It installs synthetic responses, freezes July 21, selects July 9, suppresses unrelated transient PWA notices, waits for fonts and two identical frames, and writes unaltered browser PNGs. Each capture records viewport, browser, clock and geometry. Manifest records every built output and evidence file SHA-256.

The first invocation failed test discovery due to a capture-harness newline typo, then the corrected full run passed. Native/device and live backend application observations were not performed. Existing feature CI/review predates the rail merge and is not combined-runtime proof. Independent QA reassessment remains the coordinator's next step.
