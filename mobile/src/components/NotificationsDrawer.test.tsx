import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Modal, StyleSheet } from 'react-native';
import type { InAppNotification } from '@calibrate/api-client';
import { IN_APP_NOTIFICATION_TYPES } from '@calibrate/shared/inAppNotifications';
import { NotificationsDrawer, notificationDrawerWidth } from './NotificationsDrawer';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));

const NOTIFICATION: InAppNotification = {
    id: 1,
    type: IN_APP_NOTIFICATION_TYPES.LOG_WEIGHT_REMINDER,
    local_date: '2026-07-20',
    title: 'Time to weigh in',
    body: 'Keep your trend current.',
    action_url: '/log?quickAdd=weight',
    read_at: null,
    dismissed_at: null,
    created_at: '2026-07-20T12:00:00.000Z'
};

function renderDrawer(overrides: Partial<React.ComponentProps<typeof NotificationsDrawer>> = {}) {
    const props: React.ComponentProps<typeof NotificationsDrawer> = {
        visible: true,
        notifications: [NOTIFICATION],
        unreadCount: 1,
        isLoading: false,
        isBusy: false,
        onClose: jest.fn(),
        onOpenNotification: jest.fn(),
        onDismissNotification: jest.fn(),
        onRetry: jest.fn(),
        ...overrides
    };
    return { props, screen: render(<NotificationsDrawer {...props} />) };
}

describe('NotificationsDrawer', () => {
    it('slides its panel independently instead of fading the entire modal', () => {
        const { screen } = renderDrawer();
        const modal = screen.UNSAFE_getByType(Modal);
        const panelStyle = StyleSheet.flatten(screen.getByTestId('notifications-drawer-panel').props.style);

        expect(modal.props.animationType).toBe('none');
        expect(panelStyle.transform).toHaveLength(1);
        expect(panelStyle.transform[0].translateX).toBeDefined();
    });

    it('uses the rendered panel width as its off-screen translation', () => {
        expect(notificationDrawerWidth(320)).toBe(288);
        expect(notificationDrawerWidth(1_024)).toBe(440);
    });

    it('reviews and acts on notifications without requiring a notification-center route', () => {
        const { props, screen } = renderDrawer();

        expect(screen.getByText('1 unread')).toBeTruthy();
        expect(screen.getByText('Time to weigh in')).toBeTruthy();
        fireEvent.press(screen.getByText('Log weight'));
        fireEvent.press(screen.getByLabelText('Dismiss Time to weigh in'));

        expect(props.onOpenNotification).toHaveBeenCalledWith(NOTIFICATION);
        expect(props.onDismissNotification).toHaveBeenCalledWith(NOTIFICATION);
    });

    it('closes from the drawer header', () => {
        const { props, screen } = renderDrawer();

        fireEvent.press(screen.getByLabelText('Close notifications'));

        expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it('does not render drawer content while closed', () => {
        const { screen } = renderDrawer({ visible: false });

        expect(screen.queryByText('Notifications')).toBeNull();
    });
});
