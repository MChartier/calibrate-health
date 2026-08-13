import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';

export const FROZEN_NOW = '2026-07-21T19:00:00.000Z';
export const FROZEN_LOCAL_DATE = '2026-07-21';
export const DETERMINISTIC_CLOCK_STEP_MS = 16;

export const UX_FIXTURE_STATES = [
  'signed-out',
  'populated',
  'empty',
  'paused',
  'loading',
  'failed-request',
  'stale',
  'offline',
] as const;

export type UxFixtureState = (typeof UX_FIXTURE_STATES)[number];

type StubMetricEntry = { id: number; date: string; weight: number };

type StubTrendMetricEntry = StubMetricEntry & {
  user_id: number;
  body_fat_percent: number | null;
  trend_weight: number;
  trend_ci_lower: number;
  trend_ci_upper: number;
};

export type AuthenticatedApiOptions = {
  foodDayStatus?: 'OPEN' | 'PAUSED';
  foodEntries?: Array<{
    id: number;
    meal_period: 'BREAKFAST';
    name: string;
    calories: number;
    servings_consumed: number;
  }>;
  metrics?: StubMetricEntry[];
  trendMetrics?: StubTrendMetricEntry[];
};

type FixtureDiagnostics = {
  browserErrors: string[];
  unexpectedApiRequests: string[];
  lastFailedRequest: string | null;
  expectedApiFailures: Set<string>;
  expectedResourceErrors: Map<number, number>;
  resourceErrors: Map<number, number>;
};

export type ExpectedApiFailure = {
  method: string;
  pathname: string;
  status: number;
};

export type UxStateController = {
  activateOffline(): Promise<void>;
  releaseLoading(): void;
};

export type UxHarness = {
  install(state: UxFixtureState, options?: AuthenticatedApiOptions): Promise<UxStateController>;
};

const AUTHENTICATED_USER = {
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

const TREND_METRICS: StubTrendMetricEntry[] = [
  { id: 3, user_id: 17, date: '2026-07-18', weight: 88.2, body_fat_percent: null, trend_weight: 88.4, trend_ci_lower: 88.0, trend_ci_upper: 88.8 },
  { id: 2, user_id: 17, date: '2026-07-11', weight: 89.0, body_fat_percent: null, trend_weight: 89.1, trend_ci_lower: 88.7, trend_ci_upper: 89.5 },
  { id: 1, user_id: 17, date: '2026-07-04', weight: 90.0, body_fat_percent: null, trend_weight: 89.8, trend_ci_lower: 89.4, trend_ci_upper: 90.2 },
];

const DEFAULT_FOOD_ENTRIES: NonNullable<AuthenticatedApiOptions['foodEntries']> = [{
  id: 31,
  meal_period: 'BREAKFAST',
  name: 'Fixture breakfast',
  calories: 360,
  servings_consumed: 1,
}];

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
    historyProgress: {
      stage: 'pace_check',
      observedDays: 6,
      requiredDays: 7,
      completeFoodDays: 6,
      requiredCompleteFoodDays: 7,
      weightSpanDays: 6,
      requiredWeightSpanDays: 7,
      weightPoints: 6,
      requiredWeightPoints: 2,
      restartedAfterPause: false,
    },
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

const diagnosticsByPage = new WeakMap<Page, FixtureDiagnostics>();
const RESOURCE_ERROR_STATUS_PATTERN = /status of (\d{3}) \(/;

function apiFailureKey({ method, pathname, status }: ExpectedApiFailure): string {
  return `${method.toUpperCase()} ${pathname} ${status}`;
}

/** Allow only the browser resource error emitted for this exact stubbed response. */
export function expectApiFailure(page: Page, failure: ExpectedApiFailure): void {
  const diagnostics = diagnosticsByPage.get(page);
  if (!diagnostics) throw new Error('Expected API failures must be declared after fixture setup.');
  diagnostics.expectedApiFailures.add(apiFailureKey(failure));
}

function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function freezeBrowserInputs(page: Page): Promise<void> {
  await page.addInitScript(({ frozenNow, clockStepMs }) => {
    const NativeDate = Date;
    const frozenEpoch = NativeDate.parse(frozenNow);
    let clockReadCount = 0;
    const deterministicNow = () => {
      const now = frozenEpoch + (clockReadCount * clockStepMs);
      clockReadCount += 1;
      return now;
    };
    const DeterministicDate = new Proxy(NativeDate, {
      apply(target, thisArgument, argumentsList) {
        if (argumentsList.length > 0) return Reflect.apply(target, thisArgument, argumentsList);
        return new target(deterministicNow()).toString();
      },
      construct(target, argumentsList) {
        return Reflect.construct(target, argumentsList.length > 0 ? argumentsList : [deterministicNow()]);
      },
    });
    Object.defineProperty(DeterministicDate, 'now', {
      configurable: true,
      value: deterministicNow,
    });
    globalThis.Date = DeterministicDate;

    const generatedIdStorageKey = '__calibrateE2eGeneratedId';
    const storedGeneratedId = Number.parseInt(
      globalThis.sessionStorage.getItem(generatedIdStorageKey) ?? '0',
      10,
    );
    let generatedId = Number.isSafeInteger(storedGeneratedId) && storedGeneratedId >= 0 ? storedGeneratedId : 0;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      configurable: true,
      value: () => {
        generatedId += 1;
        globalThis.sessionStorage.setItem(generatedIdStorageKey, generatedId.toString());
        return `00000000-0000-4000-8000-${generatedId.toString(16).padStart(12, '0')}`;
      },
    });
  }, { frozenNow: FROZEN_NOW, clockStepMs: DETERMINISTIC_CLOCK_STEP_MS });
}

function formatFailureContext(page: Page, testInfo: TestInfo, diagnostics: FixtureDiagnostics): string {
  const viewport = page.viewportSize();
  let route = 'unavailable';
  try {
    route = new URL(page.url()).pathname;
  } catch {
    // Navigation may have failed before a URL was available.
  }
  return [
    `route=${route}`,
    `viewport=${viewport ? `${viewport.width}x${viewport.height}` : testInfo.project.name}`,
    `project=${testInfo.project.name}`,
    `last_failed_request=${diagnostics.lastFailedRequest ?? 'none'}`,
  ].join(' ');
}

async function installSignedOutApi(page: Page): Promise<void> {
  expectApiFailure(page, { method: 'GET', pathname: '/auth/me', status: 401 });
  await page.route('**/auth/me', (route) => fulfillJson(route, { message: 'Not authenticated' }, 401));
}

async function installAuthenticatedApi(
  page: Page,
  state: Exclude<UxFixtureState, 'signed-out' | 'offline'>,
  options: AuthenticatedApiOptions,
  releaseLoading: Promise<void>,
): Promise<void> {
  const foodEntries = options.foodEntries
    ?? (state === 'empty' ? [] : DEFAULT_FOOD_ENTRIES);
  const metrics = options.metrics
    ?? (state === 'empty' ? [] : TREND_METRICS.map(({ id, date, weight }) => ({ id, date, weight })));
  const trendMetrics = options.trendMetrics ?? (state === 'empty' ? [] : TREND_METRICS);
  const foodDayStatus = options.foodDayStatus ?? (state === 'paused' ? 'PAUSED' : 'OPEN');
  let foodRequestCount = 0;
  if (state === 'failed-request' || state === 'stale') {
    expectApiFailure(page, { method: 'GET', pathname: '/api/v1/food', status: 503 });
  }

  await page.route('**/*', async (route) => {
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
    if (pathname === '/api/v1/user/profile') return fulfillJson(route, PROFILE_RESPONSE);
    if (pathname === '/api/v1/notifications/in-app') {
      return fulfillJson(route, { notifications: [], unread_count: 0 });
    }
    if (pathname === '/api/v1/notifications/stream') {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': fixture heartbeat\n\n' });
    }
    if (pathname === '/api/v1/food/recent') return fulfillJson(route, { items: [] });
    if (pathname === '/api/v1/my-foods') return fulfillJson(route, []);
    if (pathname === '/api/v1/food') {
      foodRequestCount += 1;
      if (state === 'loading') await releaseLoading;
      if (state === 'failed-request' || (state === 'stale' && foodRequestCount > 1)) {
        return fulfillJson(route, { message: 'This fixture request failed.' }, 503);
      }
      return fulfillJson(route, foodEntries);
    }
    if (pathname === '/api/v1/food-days/pause') {
      const isPaused = foodDayStatus === 'PAUSED';
      return fulfillJson(route, {
        pause: {
          active: isPaused,
          id: isPaused ? 9 : null,
          starts_on: isPaused ? FROZEN_LOCAL_DATE : null,
          expected_resume_on: isPaused ? '2099-12-31' : null,
          resumed_on: null,
          started_at: isPaused ? FROZEN_NOW : null,
          resumed_at: null,
          materialized_through: isPaused ? FROZEN_LOCAL_DATE : null,
          resume_confirmation_due: false,
        },
      });
    }
    if (pathname === '/api/v1/food-days/range') {
      const startDate = url.searchParams.get('start') ?? FROZEN_LOCAL_DATE;
      return fulfillJson(route, {
        start_date: startDate,
        end_date: url.searchParams.get('end') ?? startDate,
        days: [{
          date: startDate,
          status: foodDayStatus,
          origin: foodDayStatus === 'PAUSED' ? 'PAUSE' : null,
          source: foodDayStatus === 'PAUSED' ? 'STORED' : 'DEFAULT',
          is_representative: false,
          is_complete: false,
          completed_at: null,
          updated_at: null,
        }],
      });
    }
    if (pathname === '/api/v1/food-days') {
      return fulfillJson(route, {
        date: url.searchParams.get('date') ?? FROZEN_LOCAL_DATE,
        status: foodDayStatus,
        origin: foodDayStatus === 'PAUSED' ? 'PAUSE' : null,
        source: foodDayStatus === 'PAUSED' ? 'STORED' : 'DEFAULT',
        is_representative: false,
        is_complete: false,
        completed_at: null,
        updated_at: null,
      });
    }
    if (pathname === '/api/v1/user/tracking-history') {
      return fulfillJson(route, { tracking_start_date: '2026-01-01' });
    }
    if (pathname === '/api/v1/calibration/status') return fulfillJson(route, CALIBRATION_STATUS_RESPONSE);
    if (pathname === '/api/v1/activity/days') {
      const localDate = url.searchParams.get('start') ?? FROZEN_LOCAL_DATE;
      return fulfillJson(route, {
        start_date: localDate,
        end_date: url.searchParams.get('end') ?? localDate,
        days: [],
      });
    }
    if (pathname === '/api/v1/goals') return fulfillJson(route, DEFAULT_GOAL);
    if (pathname === '/api/v1/metrics' && url.searchParams.get('include_trend') === 'true') {
      return fulfillJson(route, {
        metrics: trendMetrics,
        meta: { weekly_rate: -0.55, volatility: 'low', total_points: trendMetrics.length, total_span_days: 14 },
      });
    }
    if (pathname === '/api/v1/metrics') return fulfillJson(route, metrics);
    if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
      diagnosticsByPage.get(page)?.unexpectedApiRequests.push(`${route.request().method()} ${pathname}`);
      return fulfillJson(route, { message: 'Unhandled deterministic fixture request' }, 501);
    }
    return route.continue();
  });
}

async function installState(
  page: Page,
  context: BrowserContext,
  state: UxFixtureState,
  options: AuthenticatedApiOptions,
): Promise<UxStateController> {
  let resolveLoading = () => {};
  const loadingReleased = new Promise<void>((resolve) => {
    resolveLoading = resolve;
  });
  if (state === 'signed-out') {
    await installSignedOutApi(page);
  } else {
    await installAuthenticatedApi(page, state === 'offline' ? 'populated' : state, options, loadingReleased);
  }
  return {
    activateOffline: () => context.setOffline(true),
    releaseLoading: resolveLoading,
  };
}

export const test = base.extend<{ ux: UxHarness; diagnostics: void }>({
  diagnostics: [async ({ page }, use, testInfo) => {
    const diagnostics: FixtureDiagnostics = {
      browserErrors: [],
      unexpectedApiRequests: [],
      lastFailedRequest: null,
      expectedApiFailures: new Set(),
      expectedResourceErrors: new Map(),
      resourceErrors: new Map(),
    };
    diagnosticsByPage.set(page, diagnostics);
    await freezeBrowserInputs(page);
    page.on('pageerror', (error) => diagnostics.browserErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const resourceStatus = Number(RESOURCE_ERROR_STATUS_PATTERN.exec(message.text())?.[1]);
      if (Number.isInteger(resourceStatus)) {
        diagnostics.resourceErrors.set(resourceStatus, (diagnostics.resourceErrors.get(resourceStatus) ?? 0) + 1);
        return;
      }
      diagnostics.browserErrors.push(`console.error: ${message.text()}`);
    });
    page.on('requestfailed', (request) => {
      const pathname = new URL(request.url()).pathname;
      diagnostics.lastFailedRequest = `${request.method()} ${pathname} (${request.failure()?.errorText ?? 'failed'})`;
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const request = response.request();
      const pathname = new URL(request.url()).pathname;
      diagnostics.lastFailedRequest = `${request.method()} ${pathname} (${response.status()})`;
      const key = apiFailureKey({ method: request.method(), pathname, status: response.status() });
      if (diagnostics.expectedApiFailures.has(key)) {
        diagnostics.expectedResourceErrors.set(
          response.status(),
          (diagnostics.expectedResourceErrors.get(response.status()) ?? 0) + 1,
        );
      }
    });

    await use();

    for (const [status, count] of diagnostics.resourceErrors) {
      const unexpectedCount = Math.max(0, count - (diagnostics.expectedResourceErrors.get(status) ?? 0));
      for (let index = 0; index < unexpectedCount; index += 1) {
        diagnostics.browserErrors.push(`console.error: unexpected resource response (${status})`);
      }
    }

    const failureContext = formatFailureContext(page, testInfo, diagnostics);
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('failure-context.json', {
        body: Buffer.from(JSON.stringify({
          context: failureContext,
          browserErrors: diagnostics.browserErrors,
          unexpectedApiRequests: diagnostics.unexpectedApiRequests,
        }, null, 2)),
        contentType: 'application/json',
      });
      console.error(`[expo-web failure] ${failureContext}`);
    }
    expect.soft(diagnostics.browserErrors, `Browser errors; ${failureContext}`).toEqual([]);
    expect.soft(diagnostics.unexpectedApiRequests, `Unhandled API requests; ${failureContext}`).toEqual([]);
  }, { auto: true }],
  ux: async ({ page, context }, use) => {
    let installed = false;
    await use({
      install: async (state, options = {}) => {
        if (installed) throw new Error('Only one deterministic UX state may be installed per test.');
        installed = true;
        return installState(page, context, state, options);
      },
    });
  },
});

export { expect };
