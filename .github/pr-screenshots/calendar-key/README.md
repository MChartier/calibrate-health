# Calendar key evidence

These are actual browser captures of the production Expo web export using deterministic synthetic
food-day fixtures. Application and test source: `90a81ddcb4d86b83a6ebbfc073ae211d26c38a94`,
based on master `5a0cc095766e854e6fe52425bb0f0568f77254a4`. The following evidence-only commit
copies the captures without changing application code. Image and source hashes are in [manifest.json](manifest.json).
Native-device execution was not performed.

| Phone, dark, collapsed | Phone, dark, expanded |
| --- | --- |
| ![Collapsed on-demand calendar key](phone-dark-collapsed.png) | ![Comparison-colored outlines and neutral tracking-shape key](phone-dark-expanded.png) |

| Phone, light, collapsed | Phone, light, expanded |
| --- | --- |
| ![Light calendar key starts collapsed](phone-light-collapsed.png) | ![Short color labels and distinct incomplete, not-started and paused shapes](phone-light-expanded.png) |

| Small phone, 320px | Desktop, 1440px viewport |
| --- | --- |
| ![Key fits the compact phone width](compact-light-expanded.png) | ![Calendar stays in its bounded desktop reading column](desktop-dark-expanded.png) |

The phone viewport is 390x844, compact viewport 320x720, and desktop viewport 1440x1000.
Calendar-modal screenshots crop to the modal bounds. Colors describe calorie balance independently
of completion: days 1, 12 and 14 have green outlines, days 4 and 9 yellow outlines, and days 7, 8
and 16 orange outlines. Completed days use the same palette as filled circles. Day 17 demonstrates
the green fallback when a completed day lacks comparison data. Today (21) is open with a yellow
outline based on current intake. Day 19 is not started, with a gray borderless circle and an x;
day 20 is paused. The bottom key uses neutral tracking shapes, while the three color-label groups
remain left, center and right justified.

At 200% text both badges grow to contain their date and glyph:

| Not started | Paused |
| --- | --- |
| ![Not-started badge with x at 200 percent text](not-started-200-percent.png) | ![Pause badge at 200 percent text](pause-200-percent.png) |

## Reproduce and verify

Run `npm.cmd run test:web:e2e -- e2e/expo-web/completed-calendar.spec.ts`. The spec writes collapsed
and expanded captures for light/dark desktop, tablet, phone and compact-phone projects; its enlarged
text test also writes both glyph-badge crops. Result: **10 passed, 6 intentional project skips**.
Assertions cover comparison-color parity for completed and unfinished days, loss/gain/maintenance
boundaries, neutral legend shapes, actual marker-and-label alignment, green fallback, glyph
containment, key reset on reopening, optional explanations, selection, current-intake edits,
offline history recovery and accessibility of both collapsed and expanded keys.

Validation of the iteration:

- Full mobile suite: **234 suites / 1,301 tests passed**.
- Full backend suite: **793 passed, 3 database-dependent tests skipped**.
- Backend, API-client and mobile typechecks passed; API generation and production web build passed.
- `git diff --check` passed.

Backend tests exercise retained local-day observations for unfinished days without freezing them
or rebuilding history from current settings, and preservation of first-completion snapshots after
reopening. Invalid, unavailable, future, wrong-date and conflicting-timezone observations remain
unavailable. Calendar tests cover loss, gain and maintenance bands and queued completion/reopening.

The broader `npm.cmd run test:ux` gate still returns **191 passed, 5 failed, 79 skipped and
54 not run**. Two goal-editor checks expect the old dialog and lack a pace-options fixture;
offline Today and terminal-error Today have existing snapshot mismatches; stale Food Log expects
an older degraded-state label. Calendar overlay and expanded-key accessibility checks passed.
No UX baseline or threshold was changed.

Earlier planned-pause browser validation (before this iteration) returned 54 passed, 1 failed and
9 skipped. Its tablet queued-pause failure passed on isolated rerun; the phone overdue-pause case
failed intermittently across runs. That broader run was not repeated for this iteration.
