import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { InAppNotificationPageItem, InAppNotificationPageResponse } from '@calibrate/api-client';
import { IN_APP_NOTIFICATION_TYPES } from '@calibrate/shared/inAppNotifications';
import { NATIVE_PUSH_STATES } from './workflow';
import { NotificationHistory } from './NotificationHistory';

const mockPush = jest.fn();
const mockRequestPermission = jest.fn(async () => undefined);
const mockRouterPush = jest.fn();
const mockQueryClients: QueryClient[] = [];
const mockApi = {
    getInAppNotifications: jest.fn<Promise<InAppNotificationPageResponse>, [unknown]>(),
    markInAppNotificationRead: jest.fn(async () => ({ ok: true as const })),
    dismissInAppNotification: jest.fn(async () => ({ ok: true as const })),
    markAllInAppNotificationsRead: jest.fn(async () => ({ ok: true as const, updated_count: 1 }))
};

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouterPush(...args) } }));
jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ api: mockApi }) }));
jest.mock('../hooks/useNativePushRegistration', () => ({
    useNativePushRegistration: () => mockPush()
}));

function notification(id: number, overrides: Partial<InAppNotificationPageItem> = {}): InAppNotificationPageItem {
    return {
        id,
        type: IN_APP_NOTIFICATION_TYPES.LOG_FOOD_REMINDER,
        local_date: '2026-08-09',
        title: `Reminder ${id}`,
        body: 'Review your log.',
        action_url: '/log?quickAdd=food',
        read_at: null,
        dismissed_at: null,
        resolved_at: null,
        created_at: `2026-08-09T12:0${id}:00.000Z`,
        updated_at: `2026-08-09T12:0${id}:00.000Z`,
        ...overrides
    };
}

function page(
    notifications: InAppNotificationPageItem[],
    nextCursor: string | null = null,
    unreadCount = notifications.filter((item) => !item.read_at && !item.dismissed_at && !item.resolved_at).length
): InAppNotificationPageResponse {
    return { notifications, unread_count: unreadCount, next_cursor: nextCursor };
}

function renderHistory() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mockQueryClients.push(queryClient);
    return render(
        <QueryClientProvider client={queryClient}>
            <NotificationHistory />
        </QueryClientProvider>
    );
}

describe('NotificationHistory', () => {
    afterEach(() => {
        for (const queryClient of mockQueryClients.splice(0)) queryClient.clear();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockPush.mockReturnValue({
            state: NATIVE_PUSH_STATES.REGISTERED,
            requestPermission: mockRequestPermission,
            openSettings: jest.fn(async () => undefined),
            refreshPermission: jest.fn(async () => undefined),
            retryRegistration: jest.fn(async () => undefined)
        });
    });

    it('keeps paginated history deduplicated and exposes read-all and preferences actions', async () => {
        mockApi.getInAppNotifications.mockImplementation(async (query: unknown) => {
            const cursor = (query as { cursor?: string }).cursor;
            return cursor ? page([notification(2), notification(1)]) : page([notification(3), notification(2)], 'older', 3);
        });
        const screen = renderHistory();

        await screen.findByText('Reminder 3');
        fireEvent.press(screen.getByTestId('notification-history-load-more'));
        await screen.findByText('Reminder 1');
        expect(screen.getAllByText('Reminder 2')).toHaveLength(1);

        fireEvent.press(screen.getByTestId('notification-mark-all-read'));
        await waitFor(() => expect(mockApi.markAllInAppNotificationsRead).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(mockApi.getInAppNotifications.mock.calls.length).toBeGreaterThanOrEqual(4));
        fireEvent.press(screen.getByTestId('notification-preferences-cta'));
        expect(mockRouterPush).toHaveBeenCalledWith('/profile');
    });

    it('offers a meaningful preference action when history is empty', async () => {
        mockApi.getInAppNotifications.mockResolvedValue(page([]));
        const screen = renderHistory();

        expect(await screen.findByTestId('notification-history-empty')).toBeTruthy();
        fireEvent.press(screen.getByRole('button', { name: 'Review notification preferences' }));
        expect(mockRouterPush).toHaveBeenCalledWith('/profile');
    });

    it('makes permission-required delivery state actionable without rendering subscription details', async () => {
        mockApi.getInAppNotifications.mockResolvedValue(page([]));
        mockPush.mockReturnValue({
            state: NATIVE_PUSH_STATES.PERMISSION_REQUIRED,
            requestPermission: mockRequestPermission,
            openSettings: jest.fn(async () => undefined),
            refreshPermission: jest.fn(async () => undefined),
            retryRegistration: jest.fn(async () => undefined)
        });
        const screen = renderHistory();

        const action = await screen.findByTestId('notification-delivery-action');
        expect(screen.getByText('Enable push notifications')).toBeTruthy();
        expect(screen.queryByText(/token|endpoint|p256dh|auth/i)).toBeNull();
        fireEvent.press(action);
        expect(mockRequestPermission).toHaveBeenCalledTimes(1);
    });
});
