import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page, Route, TestInfo } from '@playwright/test';
import { expect, expectApiFailure, FROZEN_LOCAL_DATE, test } from './fixtures';

const EVIDENCE_DIR = path.resolve('docs/screenshots/launch-17');
const REALTIME_EVENT_NAME = 'notification-update';
const TRANSIENT_PWA_TITLES = new Set([
  'Back online',
  'Update ready',
  'Update failed',
  'Updating Calibrate',
]);

type NotificationItem = {
  id: number;
  type: 'LOG_WEIGHT_REMINDER' | 'LOG_FOOD_REMINDER' | 'GENERIC';
  local_date: string;
  title: string;
  body: string;
  action_url: string;
  read_at: string | null;
  dismissed_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationFixture = {
  failHistoryRequests: number;
  history: NotificationItem[];
  addIncoming(): NotificationItem;
};

function notification(id: number, overrides: Partial<NotificationItem> = {}): NotificationItem {
  const minute = String(id % 60).padStart(2, '0');
  const isWeight = id % 2 === 1;
  return {
    id,
    type: isWeight ? 'LOG_WEIGHT_REMINDER' : 'LOG_FOOD_REMINDER',
    local_date: FROZEN_LOCAL_DATE,
    title: isWeight ? `Weight reminder ${id}` : `Food reminder ${id}`,
    body: isWeight ? 'Keep your weight trend current.' : 'Finish today\'s food log.',
    action_url: isWeight ? '/log?quickAdd=weight' : '/log?quickAdd=food',
    read_at: null,
    dismissed_at: null,
    resolved_at: null,
    created_at: `2026-07-21T18:${minute}:00.000Z`,
    updated_at: `2026-07-21T18:${minute}:00.000Z`,
    ...overrides,
  };
}

function populatedHistory(): NotificationItem[] {
  const history = Array.from({ length: 23 }, (_, index) => notification(123 - index));
  history[2] = notification(121, { read_at: '2026-07-21T18:45:00.000Z' });
  history[3] = notification(120, {
    read_at: '2026-07-21T18:44:00.000Z',
    dismissed_at: '2026-07-21T18:44:00.000Z',
  });
  history[4] = notification(119, { resolved_at: '2026-07-21T18:43:00.000Z' });
  return history;
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: status >= 400 ? { 'x-request-id': 'fixture-notification-history' } : undefined,
    body: JSON.stringify(body),
  });
}

function activeNotifications(history: NotificationItem[]) {
  return history.filter((item) => !item.read_at && !item.dismissed_at && !item.resolved_at);
}

async function installNotificationApi(page: Page, empty = false): Promise<NotificationFixture> {
  const fixture: NotificationFixture = {
    failHistoryRequests: 0,
    history: empty ? [] : populatedHistory(),
    addIncoming() {
      const incoming = notification(124, {
        title: 'A new reminder arrived',
        body: 'This row arrived while older history stayed paginated.',
      });
      this.history = [incoming, ...this.history.filter(({ id }) => id !== incoming.id)];
      return incoming;
    },
  };

  await page.route('**/api/v1/notifications/in-app**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method();

    if (pathname === '/api/v1/notifications/in-app/read-all' && method === 'PATCH') {
      let updatedCount = 0;
      fixture.history = fixture.history.map((item) => {
        if (item.read_at) return item;
        updatedCount += 1;
        return { ...item, read_at: '2026-07-21T19:05:00.000Z' };
      });
      return fulfillJson(route, { ok: true, updated_count: updatedCount });
    }

    const itemMatch = pathname.match(/^\/api\/v1\/notifications\/in-app\/(\d+)\/(read|dismiss)$/);
    if (itemMatch && method === 'PATCH') {
      const id = Number(itemMatch[1]);
      const operation = itemMatch[2];
      fixture.history = fixture.history.map((item) => {
        if (item.id !== id) return item;
        if (operation === 'dismiss' && !item.resolved_at) {
          return {
            ...item,
            read_at: item.read_at ?? '2026-07-21T19:04:00.000Z',
            dismissed_at: item.dismissed_at ?? '2026-07-21T19:04:00.000Z',
          };
        }
        if (operation === 'read' && !item.dismissed_at && !item.resolved_at) {
          return { ...item, read_at: item.read_at ?? '2026-07-21T19:04:00.000Z' };
        }
        return item;
      });
      return fulfillJson(route, { ok: true });
    }

    if (pathname !== '/api/v1/notifications/in-app' || method !== 'GET') return route.fallback();

    const view = url.searchParams.get('view');
    const active = activeNotifications(fixture.history);
    if (view === 'active') {
      return fulfillJson(route, {
        notifications: active.slice(0, 5),
        unread_count: active.length,
        next_cursor: active.length > 5 ? `after-${active[4].id}` : null,
      });
    }

    if (view === 'history') {
      if (fixture.failHistoryRequests > 0) {
        fixture.failHistoryRequests -= 1;
        return fulfillJson(route, {
          message: 'Notification history is temporarily unavailable.',
          code: 'NOTIFICATION_HISTORY_UNAVAILABLE',
          retryable: true,
          request_id: 'fixture-notification-history',
        }, 503);
      }
      const cursor = url.searchParams.get('cursor');
      const cursorId = cursor?.startsWith('after-') ? Number(cursor.slice('after-'.length)) : null;
      const eligible = cursorId ? fixture.history.filter(({ id }) => id < cursorId) : fixture.history;
      const pageItems = eligible.slice(0, 20);
      return fulfillJson(route, {
        notifications: pageItems,
        unread_count: active.length,
        next_cursor: eligible.length > pageItems.length ? `after-${pageItems.at(-1)!.id}` : null,
      });
    }

    return route.fallback();
  });

  return fixture;
}

async function installRealtimeHarness(page: Page) {
  await page.addInitScript((eventName) => {
    type Listener = (event: { data: string }) => void;
    const sources: Array<{ listeners: Map<string, Set<Listener>>; closed: boolean }> = [];

    class FixtureEventSource {
      listeners = new Map<string, Set<Listener>>();
      closed = false;
      onerror: ((event: Event) => unknown) | null = null;

      constructor(_url: string, _options?: EventSourceInit) {
        sources.push(this);
      }

      addEventListener(name: string, listener: Listener) {
        const listeners = this.listeners.get(name) ?? new Set<Listener>();
        listeners.add(listener);
        this.listeners.set(name, listeners);
      }

      close() {
        this.closed = true;
      }
    }

    Object.defineProperty(window, 'EventSource', { configurable: true, value: FixtureEventSource });
    Object.defineProperty(window, '__CALIBRATE_NOTIFICATION_E2E__', {
      configurable: true,
      value: {
        emit(payload: unknown) {
          const event = { data: JSON.stringify(payload) };
          for (const source of sources) {
            if (source.closed) continue;
            for (const listener of source.listeners.get(eventName) ?? []) listener(event);
          }
        },
      },
    });
  }, REALTIME_EVENT_NAME);
}

async function emitNotificationUpdate(page: Page) {
  await page.evaluate(() => {
    const harness = (window as unknown as {
      __CALIBRATE_NOTIFICATION_E2E__: { emit(payload: unknown): void };
    }).__CALIBRATE_NOTIFICATION_E2E__;
    harness.emit({ reason: 'created', updated_at: '2026-07-21T19:05:00.000Z' });
  });
}

async function installDeniedBrowserPermission(page: Page) {
  await page.addInitScript(() => {
    let permission: NotificationPermission = 'default';
    const NativeNotification = window.Notification ?? class FixtureNotification {};
    const fixtureNotification = new Proxy(NativeNotification, {
      get(target, property, receiver) {
        if (property === 'permission') return permission;
        if (property === 'requestPermission') {
          return async () => {
            permission = 'denied';
            return permission;
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });
    Object.defineProperty(window, 'Notification', { configurable: true, value: fixtureNotification });
    Object.defineProperty(window, 'PushManager', {
      configurable: true,
      value: class FixturePushManager {},
    });
    if (!('serviceWorker' in navigator)) {
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
          addEventListener() {},
          removeEventListener() {},
          getRegistration: async () => null,
          getRegistrations: async () => [],
        },
      });
    }
  });

  await page.route('**/api/v1/client-config', (route) => fulfillJson(route, {
    api_version: 1,
    server_version: '1.0.0',
    capabilities: {
      self_hosted_server_url: true,
      native_push: false,
      web_push: true,
      health_connect_activity: true,
      wear_os_ready: true,
    },
  }));
}

async function hideTransientPwaNotices(page: Page) {
  await page.locator('[role="status"], [role="alert"]').evaluateAll((notices, titles) => {
    for (const notice of notices) {
      const text = notice.textContent ?? '';
      if ((titles as string[]).some((title) => text.includes(title))) {
        (notice as HTMLElement).style.display = 'none';
      }
    }
  }, [...TRANSIENT_PWA_TITLES]);
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.bodyWidth).toBeLessThanOrEqual(widths.clientWidth);
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}

async function captureEvidence(page: Page, testInfo: TestInfo, state: 'history' | 'drawer') {
  if (process.env.CALIBRATE_CAPTURE_EVIDENCE !== '1') return;
  const filename = state === 'history'
    ? 'notification-history-desktop-1024x1000.png'
    : 'notification-empty-drawer-phone-320x568.png';
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  await hideTransientPwaNotices(page);
  await mkdir(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, filename), fullPage: false });
  const viewport = page.viewportSize();
  expect(viewport).toEqual(state === 'history'
    ? { width: 1_024, height: 1_000 }
    : { width: 320, height: 568 });
}

test('notification drawer and history preserve state, pagination, delivery, and routing truth', async (
  { page, ux },
  testInfo,
) => {
  const project = testInfo.project.name;
  if (project === 'desktop-chrome') {
    await page.setViewportSize({ width: 1_024, height: 1_000 });
  } else if (project === 'compact-phone-chrome') {
    await page.setViewportSize({ width: 320, height: 568 });
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  const controller = await ux.install(project === 'android-phone-chrome' ? 'offline' : 'populated');
  await installRealtimeHarness(page);
  if (project === 'compact-phone-chrome') await installDeniedBrowserPermission(page);
  const fixture = await installNotificationApi(page, project === 'compact-phone-chrome');

  if (project === 'tablet-chrome') {
    fixture.failHistoryRequests = 10;
    expectApiFailure(page, {
      method: 'GET',
      pathname: '/api/v1/notifications/in-app',
      status: 503,
    });
    await page.goto('/notifications');
    const error = page.getByTestId('async-state-error');
    await expect(error.getByText("Can't load notification history", { exact: true })).toBeVisible();
    await expect(page.getByTestId('notification-history-empty')).toHaveCount(0);
    fixture.failHistoryRequests = 0;
    await error.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(page.getByTestId('notification-history-list')).toBeVisible();
    await page.getByRole('button', { name: 'Back to Today', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/today');
    await expectNoHorizontalOverflow(page);
    return;
  }

  if (project === 'compact-phone-chrome') {
    await page.goto('/today');
    expect(await page.evaluate(() => ({
      notification: 'Notification' in window,
      permission: 'Notification' in window ? window.Notification.permission : null,
      pushManager: 'PushManager' in window,
      serviceWorker: 'serviceWorker' in navigator,
    }))).toEqual({
      notification: true,
      permission: 'default',
      pushManager: true,
      serviceWorker: true,
    });
    await hideTransientPwaNotices(page);
    await page.getByTestId('notifications-button').click();
    const drawer = page.getByTestId('notifications-drawer-panel');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('All caught up', { exact: true })).toBeVisible();
    await expect(drawer.getByTestId(/^notification-card-/)).toHaveCount(0);
    await expect(drawer.getByTestId('view-all-notifications')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureEvidence(page, testInfo, 'drawer');

    await drawer.getByTestId('view-all-notifications').click();
    await expect(page).toHaveURL((url) => url.pathname === '/notifications');
    await expect(page.getByTestId('notifications-drawer-panel')).toHaveCount(0);
    await expect(page.getByTestId('notification-history-empty')).toContainText('No notification history yet');
    const delivery = page.getByTestId('notification-delivery-status');
    await expect(delivery).toContainText('Enable notifications in this browser');
    await page.getByTestId('notification-delivery-action').click();
    await expect(delivery).toContainText('Notifications are blocked for this site.');
    await expect(page.getByTestId('notification-delivery-action')).toContainText('Check notification access');
    await page.getByTestId('notification-preferences-cta').click();
    await expect(page).toHaveURL((url) => url.pathname === '/settings');
    await expectNoHorizontalOverflow(page);
    return;
  }

  if (project === 'android-phone-chrome') {
    await page.goto('/notifications');
    const history = page.getByTestId('notification-history');
    await expect(history.getByTestId('notification-history-list')).toBeVisible();
    await controller.activateOffline();
    await expect(history.getByText('Offline - showing saved information', { exact: true })).toBeVisible();
    await expect(history.getByTestId('notification-card-123')).toBeVisible();
    await page.context().setOffline(false);
    await history.getByTestId('notification-open-123').click();
    await expect(page).toHaveURL((url) => url.pathname === '/weight');
    await expectNoHorizontalOverflow(page);
    return;
  }

  await page.goto('/today');
  await expect(page.getByTestId('notifications-badge')).toContainText('20');
  await hideTransientPwaNotices(page);
  await page.getByTestId('notifications-button').click();
  const drawer = page.getByTestId('notifications-drawer-panel');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId(/^notification-card-/)).toHaveCount(5);
  await expect(drawer.getByText('20 unread', { exact: true })).toBeVisible();
  await drawer.getByTestId('view-all-notifications').click();

  await expect(page).toHaveURL((url) => url.pathname === '/notifications');
  await expect(page.getByTestId('notifications-drawer-panel')).toHaveCount(0);
  const history = page.getByTestId('notification-history');
  const historyList = history.getByTestId('notification-history-list');
  await expect(historyList.getByTestId(/^notification-card-/)).toHaveCount(20);
  await expect(history.getByTestId('notification-card-119')).toContainText('Resolved');
  await expect(history.getByTestId('notification-dismiss-119')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await captureEvidence(page, testInfo, 'history');

  fixture.addIncoming();
  await emitNotificationUpdate(page);
  await expect(history.getByTestId('notification-card-124')).toContainText('A new reminder arrived');
  await history.getByTestId('notification-history-load-more').click();
  await expect(historyList.getByTestId(/^notification-card-/)).toHaveCount(24);
  const renderedIds = await historyList.getByTestId(/^notification-card-/).evaluateAll((cards) =>
    cards.map((card) => card.getAttribute('data-testid')),
  );
  expect(new Set(renderedIds).size).toBe(renderedIds.length);

  await history.getByTestId('notification-mark-all-read').click();
  await expect(history.getByText('0 unread notifications', { exact: true })).toBeVisible();
  await expect(page.getByTestId('notifications-badge')).toHaveCount(0);
  await expect(history.getByTestId('notification-card-123')).toContainText('Read');
  await expect(history.getByTestId('notification-card-119')).toContainText('Resolved');
  await expect(history.getByTestId('notification-mark-all-read')).toBeDisabled();

  await hideTransientPwaNotices(page);
  await page.getByTestId('notifications-button').click();
  await expect(page.getByTestId('notifications-drawer-panel').getByText('All caught up', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close notifications', exact: true }).click();
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/today');
  await expectNoHorizontalOverflow(page);
});
