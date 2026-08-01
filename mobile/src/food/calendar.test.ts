import type { FoodLogDay, FoodLogDaySource, FoodLogDayStatus } from '@calibrate/api-client';
import {
    getCalendarMonthRange,
    getCalendarWeeks,
    getFoodDayCalendarMarker,
    shiftMonth
} from './calendar';

function day(
    date: string,
    status: FoodLogDayStatus,
    source: FoodLogDaySource
): FoodLogDay {
    return {
        date,
        status,
        source,
        origin: source === 'STORED' ? 'USER' : null,
        is_representative: status === 'COMPLETE',
        is_complete: status === 'COMPLETE',
        completed_at: null,
        updated_at: null
    };
}

describe('food-day calendar', () => {
    it('maps canonical history into distinct calendar markers', () => {
        const today = '2026-07-18';

        expect(getFoodDayCalendarMarker(day('2026-07-14', 'COMPLETE', 'STORED'), today)).toBe('complete');
        expect(getFoodDayCalendarMarker(day('2026-07-15', 'INCOMPLETE', 'STORED'), today)).toBe('incomplete');
        expect(getFoodDayCalendarMarker(day('2026-07-16', 'OPEN', 'DEFAULT'), today)).toBe('incomplete');
        expect(getFoodDayCalendarMarker(day('2026-07-17', 'INCOMPLETE', 'INFERRED_EMPTY'), today)).toBe('not-started');
        expect(getFoodDayCalendarMarker(day('2026-07-18', 'PAUSED', 'ACTIVE_PAUSE'), today)).toBe('paused');
        expect(getFoodDayCalendarMarker(day('2026-07-18', 'OPEN', 'DEFAULT'), today)).toBe('none');
    });

    it('builds complete Sunday-first weeks for leap months', () => {
        const weeks = getCalendarWeeks('2024-02');
        expect(weeks).toHaveLength(5);
        expect(weeks[0]).toEqual([null, null, null, null, '2024-02-01', '2024-02-02', '2024-02-03']);
        expect(weeks[4][4]).toBe('2024-02-29');
    });

    it('shifts across years and clamps month requests to the selectable range', () => {
        expect(shiftMonth('2026-01', -1)).toBe('2025-12');
        expect(shiftMonth('2026-12', 1)).toBe('2027-01');
        expect(getCalendarMonthRange('2026-07', '2026-07-11', '2026-07-18')).toEqual({
            startDate: '2026-07-11',
            endDate: '2026-07-18'
        });
    });
});
