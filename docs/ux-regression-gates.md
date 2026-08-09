# UX regression gates

Launch UX validation uses one exported Expo web build and one loopback static server per command.
`scripts/ux-gates.mjs` selects `playwright.ux.config.ts`; the shared Playwright wrapper owns the
build/server lifecycle and always tears the server down after the run.

## Commands

Run `npm.cmd run setup` after cloning or whenever `package-lock.json` changes. Repo-owned host setup
uses the installed `@playwright/test` CLI to provision the lock-pinned Chromium revision
idempotently; `ci:local` runs the same setup before reaching the UX gate.

```powershell
npm.cmd run test:ux:a11y
npm.cmd run test:ux:visual
npm.cmd run test:ux
```

- `test:ux:a11y` runs `launch-22-accessibility.spec.ts` once in the 1024 desktop project.
- `test:ux:visual` runs `launch-22-visual.spec.ts` at 320x568, 390x844, 820x1180,
  1024x1000, and 1440x1000.
- `test:ux` runs both files in one Playwright invocation, so it does not rebuild or restart the
  static export between semantic and visual checks.

The UX config freezes locale, timezone, clock, generated values, animation, viewport, and browser.
Accessibility results reject critical and serious axe findings. Visual comparison uses reviewed
Windows Chromium baselines and a maximum 0.2 percent changed-pixel ratio. Normal validation never
passes Playwright's snapshot-update flag.

## Reviewing snapshot changes

Snapshot changes require an explicit review action from a Windows host using the pinned Playwright
Chromium revision:

```powershell
$env:CALIBRATE_APPROVE_UX_SNAPSHOTS='1'
npm.cmd run test:ux:update-snapshots
Remove-Item Env:CALIBRATE_APPROVE_UX_SNAPSHOTS
```

The update command refuses every value except the exact string `1`. Review the complete changed
images, confirm the intended route, fixture state, viewport, theme, and text scale, then run
`npm.cmd run test:ux` again without the approval variable. Do not accept snapshots to hide an
unexplained layout, focus, contrast, clipping, or stale-state regression.

## CI evidence

Pull requests and release tags run the combined gate on `windows-latest`, Node 24.14.0, and the
Chromium revision installed by the locked Playwright package. Release tagging depends on the
Windows UX job; Linux release checks do not compare Windows image baselines.

Every hosted run uploads `.codex-screenshots/expo-web-ux-results` even when validation fails. The
directory contains deterministic fixture screenshots/traces plus bounded accessibility attachments.
Accessibility JSON includes only the fixed surface, rule, impact, help, node count, project, and
viewport fields. It must not include URLs, selectors, HTML, visible text, form values, request data,
or raw axe results.

Intentional unnamed-control, contrast, focus-order, and spacing probes inject temporary defects and
pass only when the underlying detector rejects those defects. Probe output is review evidence only;
never commit a deliberately failing production state.
