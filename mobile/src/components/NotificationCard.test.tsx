import { fireEvent, render } from '@testing-library/react-native';
import type { InAppNotificationPageItem } from '@calibrate/api-client';
import { IN_APP_NOTIFICATION_TYPES } from '@calibrate/shared/inAppNotifications';
import { NotificationCard } from './NotificationCard';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

function notification(overrides: Partial<InAppNotificationPageItem> = {}): InAppNotificationPageItem {
    return {
        id: 7,
        type: IN_APP_NOTIFICATION_TYPES.LOG_WEIGHT_REMINDER,
        local_date: '2026-08-09',
        title: 'Log weight',
        body: 'Keep your trend current.',
        action_url: '/weight',
        read_at: null,
        dismissed_at: null,
        resolved_at: null,
        created_at: '2026-08-09T12:30:00.000Z',
        updated_at: '2026-08-09T12:30:00.000Z',
        ...overrides
    };
}

describe('NotificationCard history presentation', () => {
    it('shows timestamp, unread state, destination, and dismissal controls', () => {
        const onOpen = jest.fn();
        const onDismiss = jest.fn();
        const item = notification();
        const screen = render(
            <NotificationCard
                notification={item}
                showHistoryState
                onOpen={onOpen}
                onDismiss={onDismiss}
            />
        );

        expect(screen.getByText(/Unread/)).toBeTruthy();
        expect(screen.getByTestId('notification-card-7')).toBeTruthy();
        fireEvent.press(screen.getByTestId('notification-open-7'));
        fireEvent.press(screen.getByTestId('notification-dismiss-7'));
        expect(onOpen).toHaveBeenCalledWith(item);
        expect(onDismiss).toHaveBeenCalledWith(item);
    });

    it('labels resolved history without presenting unread or broken dismissal actions', () => {
        const screen = render(
            <NotificationCard
                notification={notification({ resolved_at: '2026-08-09T13:00:00.000Z' })}
                showHistoryState
                onOpen={jest.fn()}
                onDismiss={jest.fn()}
            />
        );

        expect(screen.getByText(/Resolved/)).toBeTruthy();
        expect(screen.queryByText(/Unread/)).toBeNull();
        expect(screen.queryByTestId('notification-dismiss-7')).toBeNull();
        expect(screen.getByTestId('notification-open-7')).toBeTruthy();
    });
});
