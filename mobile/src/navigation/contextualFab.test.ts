import type { MetricEntry } from '@calibrate/api-client';
import { getActiveTabRoute, resolveContextualFab } from './contextualFab';

const TODAY = '2026-07-20';
const TODAY_METRIC: MetricEntry = { id: 1, date: `${TODAY}T00:00:00.000Z`, weight: 168.2 };

describe('contextual tab FAB', () => {
    it('identifies primary tabs and the full food-log surface', () => {
        expect(getActiveTabRoute('/today')).toBe('today');
        expect(getActiveTabRoute('/progress/')).toBe('progress');
        expect(getActiveTabRoute('/food-log?date=2026-07-20')).toBe('food-log');
        expect(getActiveTabRoute('/settings')).toBeNull();
        expect(getActiveTabRoute('/weight?date=2026-07-20')).toBeNull();
    });

    it('keeps Add food on Today and the full Food log', () => {
        expect(resolveContextualFab({
            pathname: '/today', today: TODAY, metrics: undefined, metricsLoaded: false,
            foodDayStatus: 'OPEN', foodDayStatusLoaded: true
        }))
            .toBe('add-food');
        expect(resolveContextualFab({
            pathname: '/food-log', today: TODAY, metrics: [], metricsLoaded: true,
            foodDayStatus: 'OPEN', foodDayStatusLoaded: true
        }))
            .toBe('add-food');
        expect(resolveContextualFab({ pathname: '/settings', today: TODAY, metrics: [], metricsLoaded: true }))
            .toBeNull();
    });

    it.each(['COMPLETE', 'INCOMPLETE', 'PAUSED'] as const)('hides Add food when the day is %s', (status) => {
        expect(resolveContextualFab({
            pathname: '/today',
            today: TODAY,
            metrics: [],
            metricsLoaded: true,
            foodDayStatus: status,
            foodDayStatusLoaded: true
        })).toBeNull();
    });

    it('shows Log weight on Progress only after confirming today is empty', () => {
        expect(resolveContextualFab({ pathname: '/progress', today: TODAY, metrics: undefined, metricsLoaded: false }))
            .toBeNull();
        expect(resolveContextualFab({ pathname: '/progress', today: TODAY, metrics: [], metricsLoaded: true }))
            .toBe('log-weight');
        expect(resolveContextualFab({ pathname: '/progress', today: TODAY, metrics: [TODAY_METRIC], metricsLoaded: true }))
            .toBeNull();
    });
});
