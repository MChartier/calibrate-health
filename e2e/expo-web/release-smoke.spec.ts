import { expect, test, type Page, type Route } from '@playwright/test';

const capturedBrowserErrors = new WeakMap<Page, string[]>();
const stubbedSignedOutResponses = new WeakSet<Page>();
const stubbedRetryableMutationResponses = new WeakSet<Page>();
const unexpectedApiRequests = new WeakMap<Page, string[]>();
const EXPECTED_SIGNED_OUT_RESOURCE_ERROR =
  'Failed to load resource: the server responded with a status of 401 (Unauthorized)';
const EXPECTED_RETRYABLE_MUTATION_RESOURCE_ERROR =
  'Failed to load resource: the server responded with a status of 503 (Service Unavailable)';

async function stubSignedOutSession(page: Page): Promise<void> {
  await page.route('**/auth/me', (route) => {
    stubbedSignedOutResponses.add(page);
    return route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Not authenticated' }),
    });
  });
}

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

const AUTHENTICATED_USER = {
  id: 17,
  email: 'release@calibratehealth.app',
  created_at: '2026-01-01T12:00:00.000Z',
  weight_unit: 'KG',
  height_unit: 'CM',
  timezone: 'America/Los_Angeles',
  language: 'en',
  reminder_log_weight_enabled: true,
  reminder_log_food_enabled: true,
  haptics_enabled: true,
  date_of_birth: '1985-05-12',
  sex: 'MALE',
  height_mm: 1800,
  activity_level: 'LIGHT',
  profile_image_url: null,
};

const PROFILE_RESPONSE = {
  profile: {
    timezone: AUTHENTICATED_USER.timezone,
    date_of_birth: AUTHENTICATED_USER.date_of_birth,
    sex: AUTHENTICATED_USER.sex,
    height_mm: AUTHENTICATED_USER.height_mm,
    activity_level: AUTHENTICATED_USER.activity_level,
    weight_unit: AUTHENTICATED_USER.weight_unit,
    height_unit: AUTHENTICATED_USER.height_unit,
  },
  latest_weight_grams: 88_200,
  goal_daily_deficit: 500,
  calorieSummary: { dailyCalorieTarget: 2_100, tdee: 2_600, bmr: 2_000, deficit: 500, missing: [] },
};

const TREND_METRICS = [
  { id: 3, user_id: 17, date: '2026-07-18', weight: 88.2, body_fat_percent: null, trend_weight: 88.4, trend_ci_lower: 88.0, trend_ci_upper: 88.8 },
  { id: 2, user_id: 17, date: '2026-07-11', weight: 89.0, body_fat_percent: null, trend_weight: 89.1, trend_ci_lower: 88.7, trend_ci_upper: 89.5 },
  { id: 1, user_id: 17, date: '2026-07-04', weight: 90.0, body_fat_percent: null, trend_weight: 89.8, trend_ci_lower: 89.4, trend_ci_upper: 90.2 },
];

const DEFAULT_GOAL = {
  id: 7,
  start_weight: 90,
  target_weight: 82,
  target_date: null,
  daily_deficit: 500,
  created_at: '2026-07-01T12:00:00.000Z',
};

const CALIBRATION_STATUS_RESPONSE = {
  generatedAt: '2026-07-18T12:00:00.000Z',
  inputFingerprint: null,
  evaluation: {
    modelVersion: 2,
    asOfDate: '2026-07-18',
    weightUnit: 'KG',
    status: 'not_ready',
    headline: 'See how your calorie plan is working',
    summary: 'Keep logging food and weight to build your first pace check.',
    nextStep: 'Keep following your current plan and log consistently.',
    historyProgress: { observedDays: 6, requiredDays: 7 },
    selectedWindowDays: null,
    dataQuality: {
      observationDays: 6,
      completeDays: 6,
      confidentDays: 6,
      suspiciousDays: 0,
      incompleteDays: 0,
      missingDays: 0,
      weightPoints: 6,
      weightSpanDays: 6,
    },
    missingCriteria: ['Build at least 7 days of food and weight history.'],
    assumptions: [],
    estimates: {
      averageIntakeKcal: null,
      observedWeeklyWeightChangeKg: null,
      targetAdjustmentKcal: null,
      configuredWeeklyWeightChangeKg: -0.455,
    },
    recommendation: null,
    activityContext: null,
  },
  recommendation: null,
  scheduledChange: null,
};

type StubMetricEntry = { id: number; date: string; weight: number };
type StubTrendMetricEntry = (typeof TREND_METRICS)[number];

type AuthenticatedApiOptions = {
  foodDayStatus?: 'OPEN' | 'PAUSED';
  foodEntries?: Array<{
    id: number;
    meal_period: 'BREAKFAST';
    name: string;
    calories: number;
    servings_consumed: number;
  }>;
  profileResponse?: typeof PROFILE_RESPONSE;
  goal?: typeof DEFAULT_GOAL;
  metrics?: StubMetricEntry[];
  trendMetrics?: StubTrendMetricEntry[];
};

const DEFAULT_FOOD_ENTRIES: NonNullable<AuthenticatedApiOptions['foodEntries']> = [{
  id: 31,
  meal_period: 'BREAKFAST',
  name: 'Greek yogurt and berries',
  calories: 360,
  servings_consumed: 1,
}];

async function stubAuthenticatedApi(page: Page, options: AuthenticatedApiOptions = {}): Promise<void> {
  unexpectedApiRequests.set(page, []);
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (pathname === '/auth/me') return fulfillJson(route, { user: AUTHENTICATED_USER });
    if (pathname === '/api/v1/client-config') {
      return fulfillJson(route, {
        api_version: 1,
        server_version: '1.0.0',
        capabilities: {
          self_hosted_server_url: true,
          native_push: false,
          web_push: false,
          health_connect_activity: true,
          wear_os_ready: true,
        },
      });
    }
    if (pathname === '/auth/mobile/sessions') return fulfillJson(route, { sessions: [] });
    if (pathname === '/api/v1/user/profile') {
      return fulfillJson(route, options.profileResponse ?? PROFILE_RESPONSE);
    }
    if (pathname === '/api/v1/notifications/in-app') {
      return fulfillJson(route, { notifications: [], unread_count: 0 });
    }
    if (pathname === '/api/v1/notifications/stream') {
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: ': release-smoke heartbeat\n\n',
      });
    }
    if (pathname === '/api/v1/food') {
      return fulfillJson(route, options.foodEntries ?? DEFAULT_FOOD_ENTRIES);
    }
    if (pathname === '/api/v1/food-days/pause') {
      const isPaused = options.foodDayStatus === 'PAUSED';
      return fulfillJson(route, {
        pause: {
          active: isPaused,
          id: isPaused ? 9 : null,
          starts_on: isPaused ? '2026-07-21' : null,
          expected_resume_on: isPaused ? '2099-12-31' : null,
          resumed_on: null,
          started_at: isPaused ? '2026-07-21T08:00:00.000Z' : null,
          resumed_at: null,
          materialized_through: isPaused ? '2026-07-23' : null,
          resume_confirmation_due: false,
        },
      });
    }
    if (pathname === '/api/v1/food-days/range') {
      const startDate = url.searchParams.get('start') ?? '2026-07-18';
      const endDate = url.searchParams.get('end') ?? startDate;
      return fulfillJson(route, {
        start_date: startDate,
        end_date: endDate,
        days: [{
          date: startDate,
          status: options.foodDayStatus ?? 'OPEN',
          origin: options.foodDayStatus === 'PAUSED' ? 'PAUSE' : null,
          source: options.foodDayStatus === 'PAUSED' ? 'STORED' : 'DEFAULT',
          is_representative: false,
          is_complete: false,
          completed_at: null,
          updated_at: null,
        }],
      });
    }
    if (pathname === '/api/v1/food-days') {
      return fulfillJson(route, {
        date: url.searchParams.get('date'),
        status: options.foodDayStatus ?? 'OPEN',
        origin: options.foodDayStatus === 'PAUSED' ? 'PAUSE' : null,
        source: options.foodDayStatus === 'PAUSED' ? 'STORED' : 'DEFAULT',
        is_representative: false,
        is_complete: false,
        completed_at: null,
        updated_at: null,
      });
    }
    if (pathname === '/api/v1/user/tracking-history') {
      return fulfillJson(route, { tracking_start_date: '2026-01-01' });
    }
    if (pathname === '/api/v1/calibration/status') {
      return fulfillJson(route, CALIBRATION_STATUS_RESPONSE);
    }
    if (pathname === '/api/v1/activity/days') {
      const localDate = url.searchParams.get('start') ?? '2026-07-18';
      return fulfillJson(route, {
        start_date: localDate,
        end_date: url.searchParams.get('end') ?? localDate,
        days: [{
          local_date: localDate,
          summary: {
            id: 5,
            local_date: localDate,
            steps: 8_400,
            active_calories_kcal: 510,
            total_calories_kcal: 2_480,
            exercise_minutes: 42,
            observed_at: `${localDate}T19:00:00.000Z`,
            created_at: `${localDate}T19:01:00.000Z`,
            updated_at: `${localDate}T19:01:00.000Z`,
          },
          records: [{
            id: 8,
            record_type: 'STEPS',
            record_id: `steps-${localDate}`,
            data_origin: 'com.sec.android.app.shealth',
            client_record_id: null,
            client_record_version: null,
            source_updated_at: `${localDate}T19:00:00.000Z`,
            start_time: `${localDate}T07:00:00.000Z`,
            end_time: `${localDate}T19:00:00.000Z`,
            start_zone_offset_seconds: -25_200,
            end_zone_offset_seconds: -25_200,
            local_date: localDate,
            count: 8_400,
            energy_kcal: null,
            weight_grams: null,
            exercise_type: null,
            title: null,
            notes: null,
            recording_method: null,
            device_type: null,
            device_manufacturer: 'Samsung',
            device_model: 'Galaxy Watch Ultra',
            created_at: `${localDate}T19:01:00.000Z`,
            updated_at: `${localDate}T19:01:00.000Z`,
          }],
        }],
      });
    }
    if (pathname === '/api/v1/goals') {
      return fulfillJson(route, options.goal ?? DEFAULT_GOAL);
    }
    if (pathname === '/api/v1/metrics' && url.searchParams.get('include_trend') === 'true') {
      const trendMetrics = options.trendMetrics ?? TREND_METRICS;
      return fulfillJson(route, {
        metrics: trendMetrics,
        meta: { weekly_rate: -0.55, volatility: 'low', total_points: trendMetrics.length, total_span_days: 14 },
      });
    }
    if (pathname === '/api/v1/metrics') {
      const metrics = options.metrics
        ?? (options.trendMetrics ?? TREND_METRICS).map(({ id, date, weight }) => ({ id, date, weight }));
      return fulfillJson(route, metrics);
    }
    if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
      unexpectedApiRequests.get(page)?.push(`${route.request().method()} ${pathname}${url.search}`);
      return fulfillJson(route, { message: 'Unhandled release-smoke request' }, 501);
    }
    return route.continue();
  });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  capturedBrowserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (stubbedSignedOutResponses.has(page) && message.text() === EXPECTED_SIGNED_OUT_RESOURCE_ERROR) return;
    if (
      stubbedRetryableMutationResponses.has(page) &&
      message.text() === EXPECTED_RETRYABLE_MUTATION_RESOURCE_ERROR
    ) return;
    errors.push(`console.error: ${message.text()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(capturedBrowserErrors.get(page) ?? [], 'Expo web emitted browser errors').toEqual([]);
  expect(unexpectedApiRequests.get(page) ?? [], 'Expo web made unhandled API requests').toEqual([]);
});

test('production export boots to the signed-out shell at each release viewport', async ({ page }) => {
  await stubSignedOutSession(page);
  await page.goto('/');

  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(page).toHaveTitle('calibrate');
  await expect(page.getByText('Calibrate Health', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create account', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy policy', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Account deletion', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const storedKeys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(storedKeys.filter((key) => /token|auth|session/i.test(key))).toEqual([]);
});

test('installed shell reports connection loss and recovery', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'PWA network state is viewport-independent.');
  await stubSignedOutSession(page);
  await page.goto('/');
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });

  await page.context().setOffline(true);
  await expect(page.getByText("You're offline", { exact: true })).toBeVisible();
  await expect(page.getByText(
    'Queued changes stay on this device and sync when the server is reachable.',
    { exact: true }
  )).toBeVisible();

  await page.context().setOffline(false);
  await expect(page.getByText('Back online', { exact: true })).toBeVisible();
  await expect(page.getByText('Queued changes are syncing now.', { exact: true })).toBeVisible();
});

test('auth deep links and reloads resolve through the static-host fallback', async ({ page }) => {
  await stubSignedOutSession(page);
  const directResponse = await page.goto('/register');
  expect(directResponse?.status()).toBe(200);
  await expect(page).toHaveURL((url) => url.pathname === '/register');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const refreshResponse = await page.reload();
  expect(refreshResponse?.status()).toBe(200);
  await expect(page).toHaveURL((url) => url.pathname === '/register');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Back to sign in', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/login');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('protected deep links return to sign in without a browser crash', async ({ page }) => {
  await stubSignedOutSession(page);
  const directResponse = await page.goto('/settings');
  expect(directResponse?.status()).toBe(200);
  await expect(page).toHaveURL((url) => url.pathname === '/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('authenticated shell renders real dashboard data and navigates release surfaces', async ({ page }) => {
  await stubAuthenticatedApi(page);
  const directResponse = await page.goto('/today');
  expect(directResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Daily balance', { exact: true })).toBeVisible();
  const foodLogSummary = page.getByRole('button', { name: /Food log.*View full log/ });
  await expect(foodLogSummary).toContainText('Breakfast');
  await expect(foodLogSummary).toContainText('Greek yogurt and berries');
  await foodLogSummary.click();
  await expect(page).toHaveURL((url) => url.pathname === '/food-log' && Boolean(url.searchParams.get('date')));
  await expect(page.getByRole('heading', { name: 'Food log', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Expand Breakfast', exact: true }).click();
  await expect(page.getByRole('main').getByText('Greek yogurt and berries', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('tab', { name: /Today$/ }).click();
  await expect(page).toHaveURL(/\/today$/);

  await page.getByRole('button', { name: 'Open notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();
  await expect(page.getByText('All caught up', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeHidden();

  await page.goto('/log?date=2026-07-18&meal=DINNER');
  await expect(page).toHaveURL((url) => url.pathname === '/today' && url.searchParams.get('openAddFood') === 'true');
  await expect(page.getByRole('dialog')).toContainText('Add food');
  await expect(page.getByRole('dialog')).toContainText('Dinner');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  const todayNavigation = page.getByRole('tab', { name: /Today$/ });
  await expect(todayNavigation).toBeVisible();
  const todayBox = await todayNavigation.boundingBox();
  expect(todayBox).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (viewport!.width >= 1_024) {
    expect(todayBox!.x).toBeLessThan(120);
  } else {
    expect(todayBox!.y).toBeGreaterThan(viewport!.height - 110);
  }

  const datePickerTrigger = page.getByRole('button', { name: 'Choose date', exact: true });
  await expect(datePickerTrigger).toBeVisible();
  await datePickerTrigger.focus();
  await datePickerTrigger.press('Enter');

  const calendarDialog = page.getByRole('dialog', { name: 'Calendar', exact: true });
  const closeDatePicker = calendarDialog.getByRole('button', { name: 'Close date picker', exact: true });
  await expect(calendarDialog).toBeVisible();
  await expect(closeDatePicker).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label')))
    .toBe('Calendar');
  await page.keyboard.press('Tab');
  await expect(closeDatePicker).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(calendarDialog).toBeHidden();
  await expect(datePickerTrigger).toBeFocused();

  await page.getByRole('tab', { name: /Progress$/ }).click();
  await expect(page).toHaveURL(/\/progress$/);
  await expect(page.getByRole('heading', { name: 'Progress', exact: true })).toBeVisible();
  await expect(page.getByText('Progress snapshot', { exact: true })).toBeVisible();
  await expect(page.getByText('Weight trend', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const reloadResponse = await page.reload();
  expect(reloadResponse?.status()).toBe(200);
  await expect(page).toHaveURL(/\/progress$/);
  await expect(page.getByText('Goal projection', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Open account', exact: true }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
  await expect(page.getByText('Personal', { exact: true })).toBeVisible();
  await expect(page.getByText('Connections', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Health Connect/ }).click();
  await expect(page.getByRole('button', { name: 'View activity history', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('paused days omit calorie progress and only preview food when entries exist', async ({ page }) => {
  const options: AuthenticatedApiOptions = {
    foodDayStatus: 'PAUSED',
    foodEntries: [...DEFAULT_FOOD_ENTRIES],
  };
  await stubAuthenticatedApi(page, options);
  await page.goto('/today');

  await expect(page.getByText('Calorie tracking paused', { exact: true })).toBeVisible();
  await expect(page.getByText('Daily balance', { exact: true })).toBeHidden();
  await expect(page.getByText('0%', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: /Food log.*View full log/ })).toContainText('Greek yogurt and berries');

  options.foodEntries = [];
  await page.reload();

  await expect(page.getByText('Calorie tracking paused', { exact: true })).toBeVisible();
  await expect(page.getByText('Daily balance', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: /Food log.*View full log/ })).toBeHidden();
});

test('mobile weight logging keeps the progress result visible and hands off a reached goal', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-phone-chrome', 'The weight editor geometry is mobile-specific.');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const options: AuthenticatedApiOptions = {
    goal: { ...DEFAULT_GOAL, target_weight: 87.5 },
    profileResponse: { ...PROFILE_RESPONSE },
    metrics: TREND_METRICS.map(({ id, date, weight }) => ({ id, date, weight })),
    trendMetrics: [...TREND_METRICS],
  };
  await stubAuthenticatedApi(page, options);

  let metricPostCount = 0;
  let goalPostCount = 0;
  await page.route('**/api/v1/goals', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    goalPostCount += 1;
    await fulfillJson(route, options.goal ?? DEFAULT_GOAL);
  });
  await page.route('**/api/v1/metrics', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    metricPostCount += 1;
    const request = route.request().postDataJSON() as { date: string; weight: number };
    expect(request.weight).toBe(87.5);
    const savedMetric = { id: 4, date: request.date, weight: request.weight };
    options.metrics = [savedMetric, ...(options.metrics ?? [])];
    options.trendMetrics = [
      {
        id: 4,
        user_id: AUTHENTICATED_USER.id,
        date: request.date,
        weight: request.weight,
        body_fat_percent: null,
        trend_weight: 87.8,
        trend_ci_lower: 87.4,
        trend_ci_upper: 88.2,
      },
      ...TREND_METRICS,
    ];
    options.profileResponse = { ...PROFILE_RESPONSE, latest_weight_grams: 87_500 };

    await fulfillJson(route, {
      ...savedMetric,
      progress_update: {
        save_kind: 'created',
        local_date: request.date,
        is_current_day: true,
        current_weight_grams: 87_500,
        goal: {
          id: DEFAULT_GOAL.id,
          mode: 'lose',
          previous_progress_percent: 72.5,
          current_progress_percent: 100,
          remaining_weight_grams: 0,
          is_complete: true,
          reached_local_date: request.date,
        },
        recognitions: [{ type: 'goal_reached' }],
      },
    });
  });

  await page.goto('/weight');
  const entrySheet = page.getByRole('dialog', { name: 'Weight entry' });
  const weightInput = entrySheet.getByRole('textbox', { name: 'Weight in kilograms', exact: true });
  const increaseWeight = entrySheet.getByRole('button', {
    name: 'Increase weight by 0.1 kilograms',
    exact: true,
  });
  await expect(weightInput).toHaveValue('88.2');

  const inputGeometry = await weightInput.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(styles.fontSize),
      height: element.getBoundingClientRect().height,
    };
  });
  expect(inputGeometry.fontSize).toBeGreaterThanOrEqual(48);
  expect(inputGeometry.height).toBeGreaterThanOrEqual(56);
  const stepperBox = await increaseWeight.boundingBox();
  expect(stepperBox).not.toBeNull();
  expect(stepperBox!.width).toBeGreaterThanOrEqual(48);
  expect(stepperBox!.height).toBeGreaterThanOrEqual(48);
  await expectNoHorizontalOverflow(page);

  await weightInput.fill('87.5');
  await entrySheet.getByRole('button', { name: 'Log weight', exact: true }).click();

  const resultSheet = page.getByRole('dialog', { name: 'Weight progress update' });
  await expect(resultSheet.getByText('Goal reached!', { exact: true })).toBeVisible();
  await expect(resultSheet.getByLabel('Saved weight 87.5 kg', { exact: true })).toBeVisible();
  await expect(resultSheet.getByText(/^Trend line: down 2 kg over \d+ days\.$/)).toBeVisible();
  await expect(resultSheet.getByRole('progressbar', { name: 'Goal progress' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await expect(resultSheet.getByText('100%', { exact: true })).toBeVisible();
  await expect(resultSheet.getByText('Target reached', { exact: true })).toBeVisible();
  await expect(resultSheet.getByTestId('goal-celebration-static')).toBeVisible();
  await expect(resultSheet.getByTestId('goal-confetti')).toHaveCount(0);
  await expect(resultSheet.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  expect(metricPostCount).toBe(1);

  await resultSheet.getByRole('button', { name: 'Set next goal', exact: true }).click();
  await expect(page).toHaveURL((url) => (
    url.pathname === '/progress' && url.searchParams.get('openNextGoal') === 'true'
  ));

  const goalEditor = page.getByRole('dialog').filter({ hasText: 'Set a new goal' });
  await expect(goalEditor.getByText('Set a new goal', { exact: true })).toBeVisible();
  await expect(goalEditor.getByRole('radio', { name: 'Maintain', exact: true })).toBeChecked();
  await expect(goalEditor.getByText('87.5 kg', { exact: true })).toBeVisible();
  const targetInput = goalEditor.getByLabel('Target in kilograms', { exact: true });
  await expect(targetInput).toHaveValue('87.5');
  const targetInputGeometry = await targetInput.evaluate((element) => {
    const styles = window.getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(styles.fontSize),
      textAlign: styles.textAlign,
    };
  });
  expect(targetInputGeometry.fontSize).toBeGreaterThanOrEqual(48);
  expect(targetInputGeometry.textAlign).toBe('center');
  expect(goalPostCount).toBe(0);
});

test('a browser write survives reload and replays exactly once with its operation id', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'IndexedDB integrity is viewport-independent.');
  await stubAuthenticatedApi(page);
  stubbedRetryableMutationResponses.add(page);

  let rejectMutation = true;
  const operationIds: string[] = [];
  await page.route('**/api/v1/metrics', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }

    operationIds.push(route.request().headers()['x-client-operation-id'] ?? '');
    if (rejectMutation) {
      await fulfillJson(route, { message: 'Temporary dogfood outage' }, 503);
      return;
    }
    await fulfillJson(route, {
      id: 4,
      date: '2026-07-18',
      weight: 91.2,
    });
  });

  await page.goto('/weight');
  const weightInput = page.getByRole('textbox', { name: 'Weight in kilograms', exact: true });
  await expect(weightInput).toBeVisible();
  const increaseWeight = page.getByRole('button', {
    name: 'Increase weight by 0.1 kilograms',
    exact: true,
  });
  await expect(increaseWeight).toBeEnabled();
  await increaseWeight.click();
  await page.getByRole('button', { name: 'Log weight', exact: true }).click();

  const queuedResultSheet = page.getByRole('dialog', { name: 'Weight progress update' });
  await expect(queuedResultSheet.getByText('Saved on this device', { exact: true })).toBeVisible();
  await queuedResultSheet.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: '1 offline changes pending' })).toBeVisible();
  expect(operationIds).toHaveLength(1);
  expect(operationIds[0]).not.toBe('');

  rejectMutation = false;
  await page.reload();
  await expect.poll(() => operationIds.length).toBe(2);
  expect(operationIds[1]).toBe(operationIds[0]);
  await expect(page.getByRole('button', { name: /offline changes/ })).toHaveCount(0);

  await page.reload();
  await page.waitForTimeout(250);
  expect(operationIds).toHaveLength(2);
});
