import { getSecondaryRouteHeader } from './secondaryRoutes';

describe('secondary route navigation', () => {
    it('uses explicit destinations for dashboard drill-down routes', () => {
        expect(getSecondaryRouteHeader('food-log')).toEqual({
            title: 'Food log',
            backLabel: 'Back to Today',
            fallbackHref: '/(tabs)/today',
            fixedDestination: true
        });
        expect(getSecondaryRouteHeader('weight-trend')).toEqual({
            title: 'Trend',
            backLabel: 'Back to Progress',
            fallbackHref: '/(tabs)/progress',
            fixedDestination: true
        });
    });

    it('uses the same concise labels as the cards that open secondary pages', () => {
        expect(getSecondaryRouteHeader('weight-trend')?.title).toBe('Trend');
        expect(getSecondaryRouteHeader('activity')?.title).toBe('Activity');
        expect(getSecondaryRouteHeader('food-log')?.title).toBe('Food log');
    });

    it('keeps primary tab routes on the root app-bar treatment', () => {
        expect(getSecondaryRouteHeader('today')).toBeNull();
        expect(getSecondaryRouteHeader('progress')).toBeNull();
    });
});
