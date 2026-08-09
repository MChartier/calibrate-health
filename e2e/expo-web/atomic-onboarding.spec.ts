import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page, Route, TestInfo } from '@playwright/test';
import { expect, expectApiFailure, test } from './fixtures';

type OnboardingStep = 'goal' | 'about' | 'burn' | 'pace' | 'import' | 'review';

type OnboardingDraft = {
  schema_version: 1;
  revision: number;
  current_step: OnboardingStep | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type OnboardingFixtureState = {
  draft: OnboardingDraft | null;
  completedAt: string | null;
  loadFailuresRemaining: number;
  saveFailuresRemaining: number;
  completionFailuresRemaining: number;
  completionOperationIds: string[];
  completionResponses: Map<string, unknown>;
};

const COMPLETE_DATA = {
  weight_unit: 'KG',
  height_unit: 'CM',
  timezone: 'America/Los_Angeles',
  date_of_birth: '1985-05-12',
  sex: 'MALE',
  height_mm: 1800,
  activity_level: 'LIGHT',
  current_weight_grams: 88_200,
  target_weight_grams: 82_000,
  daily_deficit: 500,
};

const ONBOARDING_USER = {
  id: 17,
  email: 'release@example.invalid',
  created_at: '2026-01-01T12:00:00.000Z',
  weight_unit: 'KG',
  height_unit: 'CM',
  timezone: 'America/Los_Angeles',
  language: 'en',
  reminder_log_weight_enabled: true,
  reminder_log_food_enabled: true,
  haptics_enabled: true,
  date_of_birth: COMPLETE_DATA.date_of_birth,
  sex: COMPLETE_DATA.sex,
  height_mm: COMPLETE_DATA.height_mm,
  activity_level: COMPLETE_DATA.activity_level,
  profile_image_url: null,
  onboarding_completed_at: null,
  account_access: { state: 'full', email_verified: true, legal_current: true },
};

function createOnboardingState(overrides: Partial<OnboardingFixtureState> = {}): OnboardingFixtureState {
  return {
    draft: {
      schema_version: 1,
      revision: 3,
      current_step: 'pace',
      data: { ...COMPLETE_DATA },
      created_at: '2026-07-20T19:00:00.000Z',
      updated_at: '2026-07-21T18:00:00.000Z',
    },
    completedAt: null,
    loadFailuresRemaining: 0,
    saveFailuresRemaining: 0,
    completionFailuresRemaining: 0,
    completionOperationIds: [],
    completionResponses: new Map(),
    ...overrides,
  };
}

async function fulfillApiError(
  route: Route,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  const requestId = `onboarding-${code.toLowerCase().replaceAll('_', '-')}`;
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'x-request-id': requestId },
    body: JSON.stringify({
      message,
      code,
      retryable: status === 408 || status === 429 || status >= 500,
      request_id: requestId,
      ...extra,
    }),
  });
}

async function installOnboardingApi(page: Page, state: OnboardingFixtureState) {
  await page.route('**/auth/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { ...ONBOARDING_USER, onboarding_completed_at: state.completedAt } }),
  }));

  await page.route('**/api/v1/onboarding/draft', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      if (state.loadFailuresRemaining > 0) {
        state.loadFailuresRemaining -= 1;
        return fulfillApiError(route, 503, 'SERVICE_UNAVAILABLE', 'Private upstream detail');
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          draft: state.draft,
          recovered_from_legacy: false,
          onboarding_completed_at: state.completedAt,
        }),
      });
    }

    if (method === 'DELETE') {
      state.draft = null;
      return route.fulfill({ status: 204, body: '' });
    }

    if (method !== 'PUT') return route.fallback();
    if (state.saveFailuresRemaining > 0) {
      state.saveFailuresRemaining -= 1;
      return fulfillApiError(route, 503, 'SERVICE_UNAVAILABLE', 'Private database detail');
    }

    const payload = route.request().postDataJSON() as {
      schema_version: 1;
      revision?: number;
      current_step: OnboardingStep | null;
      data: Record<string, unknown>;
    };
    if (state.draft && payload.revision !== state.draft.revision) {
      return fulfillApiError(
        route,
        409,
        'ONBOARDING_DRAFT_CONFLICT',
        'The saved setup changed.',
        { draft: state.draft },
      );
    }

    state.draft = {
      schema_version: 1,
      revision: (state.draft?.revision ?? 0) + 1,
      current_step: payload.current_step,
      data: payload.data,
      created_at: state.draft?.created_at ?? '2026-07-21T19:00:00.000Z',
      updated_at: '2026-07-21T19:00:00.000Z',
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ draft: state.draft }),
    });
  });

  await page.route('**/api/v1/onboarding/complete', async (route) => {
    const operationId = route.request().headers()['x-client-operation-id'] ?? '';
    state.completionOperationIds.push(operationId);
    if (state.completionFailuresRemaining > 0) {
      state.completionFailuresRemaining -= 1;
      return fulfillApiError(route, 503, 'SERVICE_UNAVAILABLE', 'Private transaction detail');
    }

    const replay = state.completionResponses.get(operationId);
    if (replay) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(replay),
      });
    }

    const payload = route.request().postDataJSON() as { expected_revision?: number };
    if (state.draft && payload.expected_revision !== state.draft.revision) {
      return fulfillApiError(
        route,
        409,
        'ONBOARDING_DRAFT_CONFLICT',
        'The saved setup changed.',
        { draft: state.draft },
      );
    }

    const completedAt = '2026-07-21T19:05:00.000Z';
    const response = {
      receipt: {
        operation_id: operationId,
        completed_at: completedAt,
        goal_id: 71,
        metric_id: 81,
        sync_cursor: '91',
      },
      user: { ...ONBOARDING_USER, onboarding_completed_at: completedAt },
    };
    state.completedAt = completedAt;
    state.draft = null;
    state.completionResponses.set(operationId, response);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

async function captureEvidence(page: Page, testInfo: TestInfo, filename: string) {
  if (process.env.CALIBRATE_CAPTURE_EVIDENCE !== '1' || testInfo.project.name !== 'desktop-chrome') return;
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    const updateTitles = new Set(['Update ready', 'Update failed']);
    for (const notice of document.querySelectorAll<HTMLElement>('[role="status"], [role="alert"]')) {
      const hasUpdateTitle = Array.from(notice.querySelectorAll('span'))
        .some((candidate) => updateTitles.has(candidate.textContent?.trim() ?? ''));
      if (hasUpdateTitle) notice.style.display = 'none';
    }
  });
  const evidenceDir = path.resolve('docs/screenshots/launch-09');
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, filename), fullPage: false });
}

test('desktop recovers a failed load and reloads the authoritative cross-device draft', async ({ page, ux }, testInfo) => {
  await page.setViewportSize({ width: 1_024, height: 1_000 });
  const state = createOnboardingState({ loadFailuresRemaining: 4 });
  await ux.install('populated');
  await installOnboardingApi(page, state);
  expectApiFailure(page, { method: 'GET', pathname: '/api/v1/onboarding/draft', status: 503 });
  expectApiFailure(page, { method: 'PUT', pathname: '/api/v1/onboarding/draft', status: 409 });

  await page.goto('/onboarding');
  await expect(page.getByTestId('async-state-error')).toBeVisible();
  await expect(page.getByText("Can't load your saved setup", { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('Choose a safe plan', { exact: true })).toBeVisible();
  await expect(page.getByTestId('onboarding-draft-status')).toHaveText('Saved setup loaded.');

  const secondPage = await page.context().newPage();
  await ux.installOnPage(secondPage);
  await installOnboardingApi(secondPage, state);
  await secondPage.goto('/onboarding');
  await expect(secondPage.getByText('Choose a safe plan', { exact: true })).toBeVisible();
  await secondPage.getByTestId('onboarding-continue').click();
  await expect(secondPage.getByText('Review your setup', { exact: true })).toBeVisible();

  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByText('Review your setup', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Setup changed on another device.');
  await captureEvidence(page, testInfo, 'cross-device-resume-desktop.png');
  await secondPage.close();
});

test('compact phone exposes a failed draft save and retries only that step', async ({ page, ux }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const state = createOnboardingState({ saveFailuresRemaining: 1 });
  await ux.install('populated');
  await installOnboardingApi(page, state);
  expectApiFailure(page, { method: 'PUT', pathname: '/api/v1/onboarding/draft', status: 503 });

  await page.goto('/onboarding');
  await expect(page.getByText('Choose a safe plan', { exact: true })).toBeVisible();
  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByRole('alert')).toContainText('Unable to save progress.');
  await expect(page.getByTestId('onboarding-continue')).toContainText('Retry save');
  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByText('Review your setup', { exact: true })).toBeVisible();
  await expect(page.getByTestId('onboarding-draft-status')).toHaveText('Progress saved.');
});

test('compact phone replays completion once with the same operation ID after reconnect', async ({ page, ux }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const state = createOnboardingState({ completionFailuresRemaining: 1 });
  if (!state.draft) throw new Error('Completion fixture requires a persisted draft.');
  state.draft.current_step = 'review';
  const controller = await ux.install('populated');
  await installOnboardingApi(page, state);
  expectApiFailure(page, { method: 'POST', pathname: '/api/v1/onboarding/complete', status: 503 });

  await page.goto('/onboarding');
  await expect(page.getByText('Review your setup', { exact: true })).toBeVisible();
  await page.getByTestId('onboarding-complete').click();
  await expect(page.getByTestId('onboarding-draft-status')).toHaveText(
    'Setup completion is waiting for a connection and will retry automatically.',
  );
  await controller.activateOffline();
  await captureEvidence(page, testInfo, 'offline-retry-compact-phone.png');
  await page.context().setOffline(false);

  await page.waitForURL(/\/today$/, { timeout: 15_000 });
  await expect.poll(() => state.completionOperationIds.length).toBe(2);
  expect(new Set(state.completionOperationIds).size).toBe(1);
  expect(state.completionOperationIds[0]).not.toBe('');
  expect(state.completionResponses.size).toBe(1);
});
