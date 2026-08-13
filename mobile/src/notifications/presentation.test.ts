import type { InAppNotification } from '@calibrate/api-client';
import { IN_APP_NOTIFICATION_TYPES } from '@calibrate/shared/inAppNotifications';
import {
    formatNotificationDate,
    formatNotificationTimestamp,
    getNotificationStateLabel,
    getNotificationText
} from './presentation';

function createNotification(overrides: Partial<InAppNotification> = {}): InAppNotification {
    return {
        id: 1,
        type: IN_APP_NOTIFICATION_TYPES.LOG_FOOD_REMINDER,
        local_date: '2026-07-20',
        title: null,
        body: null,
        action_url: '/log?quickAdd=food',
        read_at: null,
        dismissed_at: null,
        created_at: '2026-07-20T12:00:00.000Z',
        ...overrides
    };
}

describe('notification presentation', () => {
    it('uses supplied notification copy when available', () => {
        expect(getNotificationText(createNotification({ title: 'Custom title', body: 'Custom body' }))).toEqual({
            title: 'Custom title',
            body: 'Custom body'
        });
    });

    it('uses fallback copy that does not refer to the retired day-completion control', () => {
        const text = getNotificationText(createNotification());

        expect(text.title).toBe('Finish food log');
        expect(text.body).toBe('Review today\'s food log and add anything that is missing.');
        expect(text.body).not.toMatch(/complete/i);
    });

    it('formats notification local dates without UTC shifting', () => {
        expect(formatNotificationDate('2026-07-20')).toMatch(/Jul 20/);
    });

    it('formats timestamps and distinguishes history states', () => {
        expect(formatNotificationTimestamp('2026-07-20T12:30:00.000Z')).toMatch(/Jul 20/);
        expect(getNotificationStateLabel(createNotification())).toBe('Unread');
        expect(getNotificationStateLabel(createNotification({ read_at: '2026-07-20T13:00:00.000Z' }))).toBe('Read');
        expect(getNotificationStateLabel(createNotification({
            read_at: '2026-07-20T13:00:00.000Z',
            dismissed_at: '2026-07-20T13:01:00.000Z'
        }))).toBe('Dismissed');
        expect(getNotificationStateLabel({
            ...createNotification(),
            resolved_at: '2026-07-20T13:02:00.000Z'
        })).toBe('Resolved');
    });
});
