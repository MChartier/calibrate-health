import type { Locator, Page, Route, TestInfo } from '@playwright/test';
import { ROUTE_IDS, ROUTE_REGISTRY } from '../../mobile/src/navigation/routeRegistry';
import { expect, test } from './fixtures';
import {
  attachAccessibilitySummary,
  collectBlockingAccessibilityViolations,
  expectNoBlockingAccessibilityViolations,
} from './ux-a11y';
import {
  UX_ACCESSIBILITY_OVERLAY_CASES,
  UX_ACCESSIBILITY_ROUTE_CASES,
  type UxLocatorContract,
} from './ux-matrix';

const SEMANTIC_PROJECTS = new Set(['desktop-chrome', 'ux-phone-320', 'ux-desktop-1024']);

const CALIBRATION_RECOMMENDATION_STATUS = {
  generatedAt: '2026-07-31T20:00:00.000Z',
  inputFingerprint: 'current-input',
  evaluation: {
    modelVersion: 2,
    asOfDate: '2026-07-31',
    weightUnit: 'KG',
    status: 'recommendation',
    headline: "You're losing weight, but slower than planned",
    summary: 'Current evidence supports a lower calorie budget.',
    nextStep: null,
    historyProgress: null,
    selectedWindowDays: 28,
    dataQuality: {
      observationDays: 28,
      completeDays: 28,
      confidentDays: 28,
      suspiciousDays: 0,
      incompleteDays: 0,
      missingDays: 0,
      weightPoints: 14,
      weightSpanDays: 28,
    },
    missingCriteria: [],
    assumptions: [],
    estimates: {
      averageIntakeKcal: { low: 1825, midpoint: 1900, high: 1975 },
      observedWeeklyWeightChangeKg: { low: -0.4, midpoint: -0.36, high: -0.3 },
      targetAdjustmentKcal: { low: -250, midpoint: -200, high: -150 },
      configuredWeeklyWeightChangeKg: -0.455,
    },
    recommendation: {
      currentTargetKcal: 1900,
      recommendedTargetKcal: 1750,
      adjustmentStepKcal: -150,
      currentTargetAdjustmentKcal: 0,
      recommendedTargetAdjustmentKcal: -150,
    },
    activityContext: null,
  },
  recommendation: {
    id: 7,
    status: 'pending',
    inputFingerprint: 'current-input',
    effectiveLocalDate: '2026-08-01',
  },
  scheduledChange: null,
};

const RESUME_CONFIRMATION_DUE_PAUSE_RESPONSE = {
  pause: {
    active: true,
    id: 4,
    starts_on: '2026-07-20',
    expected_resume_on: '2026-07-23',
    resumed_on: null,
    started_at: '2026-07-20T08:00:00.000Z',
    resumed_at: null,
    materialized_through: '2026-07-23',
    resume_confirmation_due: true,
  },
};

test.describe.configure({ mode: 'serial' });
test.use({ serviceWorkers: 'block' });

function locatorForContract(page: Page, contract: UxLocatorContract): Locator {
  if (contract.kind === 'test-id') return page.getByTestId(contract.value);
  return page.getByRole(contract.role, {
    name: contract.name,
    exact: contract.exact,
  });
}

async function waitForReadySurface(page: Page, contract: UxLocatorContract): Promise<void> {
  await expect(locatorForContract(page, contract).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function installAccessibilityApiExtensions(
  page: Page,
  routeId: (typeof ROUTE_IDS)[number],
  surfaceId: string,
) {
  const sessions = [
    {
      id: 'browser_current',
      kind: 'browser',
      device_label: 'Chrome on Windows',
      created_at: '2026-08-01T12:00:00.000Z',
      last_activity_at: '2026-08-09T12:00:00.000Z',
      current: true,
    },
    {
      id: 'mobile_remote',
      kind: 'android_phone',
      device_label: 'Pixel 9',
      created_at: '2026-07-01T12:00:00.000Z',
      last_activity_at: null,
      current: false,
    },
  ];
  await page.route('**/auth/sessions', (route) => fulfillJson(route, { sessions }));
  await page.route('**/auth/mobile/sessions', (route) => fulfillJson(route, { sessions }));
  await page.route('**/api/v1/my-foods/library**', (route) => fulfillJson(route, {
    items: [],
    next_cursor: null,
  }));

  if (surfaceId === 'calibration-suggestion-details') {
    await page.route('**/api/v1/calibration/status', (route) => {
      return fulfillJson(route, CALIBRATION_RECOMMENDATION_STATUS);
    });
  }

  if (surfaceId === 'resume-tracking-prompt') {
    await page.route('**/api/v1/food-days/pause', (route) => {
      return fulfillJson(route, RESUME_CONFIRMATION_DUE_PAUSE_RESPONSE);
    });
  }

  if (routeId === 'legal-update') {
    await page.route('**/api/v1/legal/status', (route) => fulfillJson(route, {
      account_access: {
        state: 'legal_acceptance_required',
        email_verified: true,
        legal_current: false,
      },
      required: { terms_version: '2026-08-09', privacy_version: '2026-07-24' },
      accepted: { terms_version: null, privacy_version: null, accepted_at: null },
    }));
  }

  if (routeId === 'onboarding') {
    await page.route('**/api/v1/onboarding/draft', (route) => fulfillJson(route, {
      draft: null,
      recovered_from_legacy: false,
      onboarding_completed_at: null,
    }));
  }
}

function runOnlyInSemanticProject(testInfo: TestInfo): void {
  test.skip(
    !SEMANTIC_PROJECTS.has(testInfo.project.name),
    'The semantic matrix runs only at the reviewed compact-phone and desktop viewports.',
  );
}

test.describe('Launch 22 accessibility coverage contracts', () => {
  test.beforeEach(({}, testInfo) => runOnlyInSemanticProject(testInfo));

  test('declares every canonical route exactly once', () => {
    const ids = UX_ACCESSIBILITY_ROUTE_CASES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ROUTE_IDS.length);
    expect([...ids].sort()).toEqual([...ROUTE_IDS].sort());

    for (const routeCase of UX_ACCESSIBILITY_ROUTE_CASES) {
      expect(routeCase.path).toBe(ROUTE_REGISTRY[routeCase.id].path);
      expect(routeCase.authClass).toBe(ROUTE_REGISTRY[routeCase.id].authClass);
      expect(routeCase.fixtureState).toBe(
        routeCase.authClass === 'authenticated' ? 'populated' : 'signed-out',
      );
    }
  });

  test('declares unique, authenticated overlay entry points', () => {
    const ids = UX_ACCESSIBILITY_OVERLAY_CASES.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([
      'add-food',
      'weight-entry',
      'historical-calendar',
      'goal-editor',
      'goal-daily-calorie-options',
      'calibration-suggestion-details',
      'notifications-drawer',
      'preferences',
      'profile-details',
      'profile-time-zone-options',
      'profile-photo',
      'health-connect',
      'galaxy-watch',
      'password',
      'import',
      'offline',
      'saved-food-new-food',
      'saved-food-new-recipe',
      'food-log-edit',
      'food-log-copy-day',
      'food-log-copy-meal',
      'food-log-copy-meal-destination',
      'food-log-save-recipe',
      'pause-tracking',
      'resume-tracking-prompt',
      'signed-in-devices',
      'session-revoke-confirmation',
      'account-export',
      'delete-account',
      'advanced-connection',
    ]));

    for (const overlayCase of UX_ACCESSIBILITY_OVERLAY_CASES) {
      expect(ROUTE_REGISTRY[overlayCase.routeId].authClass).toBe('authenticated');
      expect(overlayCase.path).toBe(ROUTE_REGISTRY[overlayCase.routeId].path);
      if (overlayCase.opensAutomatically) {
        expect(overlayCase.open).toHaveLength(0);
      } else {
        expect(overlayCase.open.length).toBeGreaterThan(0);
      }
      expect(overlayCase.ready).toMatchObject({ kind: 'role', role: 'dialog' });
    }
  });

  test('declares query-driven overlays as automatic entry points', () => {
    expect(UX_ACCESSIBILITY_OVERLAY_CASES
      .filter(({ opensAutomatically }) => opensAutomatically)
      .map(({ id }) => id)).toEqual([
        'resume-tracking-prompt',
      ]);
  });
});

test.describe('Launch 22 canonical route accessibility', () => {
  test.beforeEach(({}, testInfo) => runOnlyInSemanticProject(testInfo));

  for (const routeCase of UX_ACCESSIBILITY_ROUTE_CASES) {
    test(`${routeCase.id} has no critical or serious WCAG A/AA findings`, async ({ page, ux }, testInfo) => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await ux.install(routeCase.fixtureState);
      await installAccessibilityApiExtensions(page, routeCase.id, routeCase.id);
      await page.goto(routeCase.path);
      await waitForReadySurface(page, routeCase.ready);
      await expectNoBlockingAccessibilityViolations(page, testInfo, {
        kind: 'route',
        surfaceId: routeCase.id,
      });
    });
  }
});

test.describe('Launch 22 open overlay accessibility', () => {
  test.beforeEach(({}, testInfo) => runOnlyInSemanticProject(testInfo));

  for (const overlayCase of UX_ACCESSIBILITY_OVERLAY_CASES) {
    test(`${overlayCase.id} has no critical or serious WCAG A/AA findings`, async ({ page, ux }, testInfo) => {
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await ux.install(overlayCase.fixtureState);
      await installAccessibilityApiExtensions(page, overlayCase.routeId, overlayCase.id);
      await page.goto(overlayCase.path);

      for (const action of overlayCase.open) {
        const trigger = locatorForContract(page, action).first();
        await expect(trigger).toBeVisible();
        await trigger.evaluate((element: HTMLElement) => element.click());
      }

      await waitForReadySurface(page, overlayCase.ready);
      await expectNoBlockingAccessibilityViolations(page, testInfo, {
        kind: 'overlay',
        surfaceId: overlayCase.id,
      });
    });
  }
});

test.describe('Launch 22 accessibility gate probes', () => {
  test.beforeEach(({}, testInfo) => runOnlyInSemanticProject(testInfo));

  async function prepareProbe(page: Page, install: () => Promise<unknown>): Promise<void> {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await install();
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  }

  test('detects an unnamed button', async ({ page, ux }, testInfo) => {
    await prepareProbe(page, () => ux.install('signed-out'));
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'launch-22-unnamed-button-probe';
      button.style.cssText = 'position:fixed;left:8px;top:8px;width:40px;height:40px;z-index:9999';
      document.body.append(button);
    });

    const violations = await collectBlockingAccessibilityViolations(page);
    await attachAccessibilitySummary(page, testInfo, {
      kind: 'probe',
      surfaceId: 'unnamed-button',
    }, violations);
    expect(violations).toContainEqual(expect.objectContaining({
      rule: 'button-name',
      impact: 'critical',
    }));
  });

  test('detects insufficient text contrast', async ({ page, ux }, testInfo) => {
    await prepareProbe(page, () => ux.install('signed-out'));
    await page.evaluate(() => {
      const text = document.createElement('p');
      text.id = 'launch-22-contrast-probe';
      text.textContent = 'Contrast gate probe';
      text.style.cssText = [
        'position:fixed',
        'left:8px',
        'top:8px',
        'z-index:9999',
        'color:#999999',
        'background:#ffffff',
        'font-size:20px',
        'font-weight:400',
      ].join(';');
      document.body.append(text);
    });

    const violations = await collectBlockingAccessibilityViolations(page);
    await attachAccessibilitySummary(page, testInfo, {
      kind: 'probe',
      surfaceId: 'contrast',
    }, violations);
    expect(violations).toContainEqual(expect.objectContaining({
      rule: 'color-contrast',
      impact: 'serious',
    }));
  });

  test('detects positive tabindex focus-order overrides', async ({ page, ux }, testInfo) => {
    await prepareProbe(page, () => ux.install('signed-out'));
    await page.evaluate(() => {
      const button = document.createElement('button');
      button.id = 'launch-22-focus-order-probe';
      button.textContent = 'Focus order probe';
      button.tabIndex = 2;
      button.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999';
      document.body.append(button);
    });

    const violations = await collectBlockingAccessibilityViolations(page);
    await attachAccessibilitySummary(page, testInfo, {
      kind: 'probe',
      surfaceId: 'focus-order',
    }, violations);
    expect(violations).toContainEqual({
      rule: 'focus-order-positive-tabindex',
      impact: 'serious',
      help: 'Focusable elements must not use a positive tabindex.',
      nodeCount: 1,
    });
  });
});
