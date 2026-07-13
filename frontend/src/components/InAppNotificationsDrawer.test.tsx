// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IN_APP_NOTIFICATION_TYPES } from '../../../shared/inAppNotifications';
import { I18nProvider } from '../i18n/I18nContext.tsx';
import type { InAppNotification } from '../queries/inAppNotifications';
import InAppNotificationsDrawer from './InAppNotificationsDrawer';

const notifications: InAppNotification[] = [
    {
        id: 17,
        type: IN_APP_NOTIFICATION_TYPES.LOG_WEIGHT_REMINDER,
        local_date: '2026-07-12',
        created_at: '2026-07-12T15:00:00.000Z',
        read_at: null,
        title: null,
        body: null,
        action_url: '/log?quickAdd=weight'
    },
    {
        id: 18,
        type: IN_APP_NOTIFICATION_TYPES.GENERIC,
        local_date: '2026-07-12',
        created_at: 'not-a-timestamp',
        read_at: null,
        title: 'Sync finished',
        body: 'Your watch activity is up to date.',
        action_url: '/activity'
    }
];

type DrawerOverrides = Partial<React.ComponentProps<typeof InAppNotificationsDrawer>>;

function renderDrawer(overrides: DrawerOverrides = {}) {
    const props: React.ComponentProps<typeof InAppNotificationsDrawer> = {
        open: true,
        notifications: [],
        unreadCount: 0,
        isLoading: false,
        isError: false,
        isOpeningNotification: false,
        dismissingNotificationId: null,
        onClose: vi.fn(),
        onRetry: vi.fn(),
        onOpenNotification: vi.fn(),
        onDismissNotification: vi.fn(),
        ...overrides
    };

    return {
        props,
        ...render(
            <I18nProvider>
                <InAppNotificationsDrawer {...props} />
            </I18nProvider>
        )
    };
}

describe('InAppNotificationsDrawer', () => {
    it('stays out of the document while closed, then exposes loading state and closes with Escape', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const { rerender } = renderDrawer({ open: false, isLoading: true, onClose });

        expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull();

        rerender(
            <I18nProvider>
                <InAppNotificationsDrawer
                    open
                    notifications={[]}
                    unreadCount={0}
                    isLoading
                    isError={false}
                    isOpeningNotification={false}
                    dismissingNotificationId={null}
                    onClose={onClose}
                    onRetry={vi.fn()}
                    onOpenNotification={vi.fn()}
                    onDismissNotification={vi.fn()}
                />
            </I18nProvider>
        );

        expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
        expect(screen.getByRole('progressbar')).toBeTruthy();
        expect(screen.getByText('Unread: 0')).toBeTruthy();

        await user.keyboard('{Escape}');

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('shows a recoverable load failure and retries on request', async () => {
        const user = userEvent.setup();
        const onRetry = vi.fn();
        renderDrawer({ isError: true, onRetry });

        expect(screen.getByRole('alert').textContent).toContain('Unable to load notifications right now.');

        await user.click(screen.getByRole('button', { name: 'Retry' }));

        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('renders reminder and custom copy and forwards open and dismiss interactions', async () => {
        const user = userEvent.setup();
        const onOpenNotification = vi.fn();
        const onDismissNotification = vi.fn();
        renderDrawer({
            notifications,
            unreadCount: notifications.length,
            onOpenNotification,
            onDismissNotification
        });

        expect(screen.getByText('Unread: 2')).toBeTruthy();
        expect(screen.getByText('Log your weight')).toBeTruthy();
        expect(screen.getByText("Today's weight entry is still missing.")).toBeTruthy();
        expect(screen.getByText('Sync finished')).toBeTruthy();
        expect(screen.getByText('Your watch activity is up to date.')).toBeTruthy();

        await user.click(screen.getByRole('button', { name: 'Log weight' }));
        await user.click(screen.getAllByRole('button', { name: 'Dismiss' })[1]);

        expect(onOpenNotification).toHaveBeenCalledWith(notifications[0]);
        expect(onDismissNotification).toHaveBeenCalledWith(notifications[1]);
    });

    it('locks only the notification currently being dismissed', () => {
        renderDrawer({ notifications, unreadCount: notifications.length, dismissingNotificationId: 17 });

        const weightAction = screen.getByRole('button', { name: 'Log weight' }) as HTMLButtonElement;
        const genericAction = screen.getByRole('button', { name: 'Open log' }) as HTMLButtonElement;
        const dismissActions = screen.getAllByRole('button', { name: 'Dismiss' }) as HTMLButtonElement[];

        expect(weightAction.disabled).toBe(true);
        expect(dismissActions[0].disabled).toBe(true);
        expect(genericAction.disabled).toBe(false);
        expect(dismissActions[1].disabled).toBe(false);
    });
});
