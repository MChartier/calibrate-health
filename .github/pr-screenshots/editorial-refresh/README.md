# Expo visual refresh screenshots

These are browser renders of the final Expo export with deterministic test accounts and food/weight
fixtures. They are not design mocks or physical-device screenshots. The regression images were
verified against the final export before copying; the interaction captures were regenerated for this PR.

## Main pages

| Today, open - 390px | Today, completed - 390px | Progress - 390px |
| --- | --- | --- |
| ![Today with chronological food and anchored actions](today-phone.png) | ![Completed day with a reversible toggle](today-completed.png) | ![Progress with flexible Trend and a bottom diagnosis](progress-phone.png) |

| Small phone - 320x568 | Completed day, dark - 390px | Progress, dark - 390px |
| --- | --- | --- |
| ![Today on the minimum phone viewport](today-320.png) | ![Completed day in dark appearance](today-completed-dark.png) | ![Progress in dark appearance with unavailable Plan check](progress-dark.png) |

| Single Trend hover target - 390px | Desktop - 1440px |
| --- | --- |
| ![Heading, fullscreen icon, and chart share a full-width highlight](progress-shared-hover.png) | ![Desktop Progress preserves the reading column and navigation rail](progress-desktop.png) |

## Supporting flows

| Settings | Saved foods | Search |
| --- | --- | --- |
| ![Open settings groups](settings-phone.png) | ![Saved foods with direct creation actions](saved-foods-phone.png) | ![Divided food search results](food-search-phone.png) |

| Amount confirmation | Recipe ingredients and totals, scrolled | Onboarding |
| --- | --- | --- |
| ![Explicit serving and amount confirmation](food-amount-phone.png) | ![Editable ingredient rows and recipe totals](recipe-phone.png) | ![Open onboarding form](onboarding-phone.png) |

## Reproduction

- `fixed-page-layout.spec.ts`: Today open, completed, and minimum-height phone captures.
- `page-refinements.spec.ts`: completed-day dark appearance.
- `progress-fixed-layout.spec.ts`: Progress with a diagnosis and unified Trend hover.
- `launch-22-visual.spec.ts`: dark Progress and supporting-flow regression images.

The first three specs run through `node scripts/expo-web-playwright.mjs`; the final spec runs through
`npm run test:ux`. The PR's release export passed all 239 applicable UX gates and 61 applicable
fixed-page/interaction checks. These captures are browser evidence; physical-device behavior remains
unverified.
