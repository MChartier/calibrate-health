import type { ActivityDaySummary, ActivityRecordEntry } from '@calibrate/api-client';
import {
    formatActivitySource,
    getActivitySourceLabels,
    isActivitySummaryDelayed,
    isActivitySummaryEmpty
} from './presentation';

const summary: ActivityDaySummary = {
    id: 1,
    local_date: '2026-07-11',
    steps: 8000,
    active_calories_kcal: 420,
    total_calories_kcal: 2400,
    exercise_minutes: 35,
    observed_at: '2026-07-11T10:00:00.000Z',
    created_at: '2026-07-11T10:00:00.000Z',
    updated_at: '2026-07-11T10:00:00.000Z'
};

describe('activity presentation', () => {
    it('attributes known packages while preserving their provenance', () => {
        expect(formatActivitySource('com.sec.android.app.shealth')).toBe(
            'Samsung Health (com.sec.android.app.shealth)'
        );
        expect(getActivitySourceLabels([
            { data_origin: 'other.app' },
            { data_origin: 'com.sec.android.app.shealth' },
            { data_origin: 'other.app' }
        ] as ActivityRecordEntry[])).toEqual([
            'Samsung Health (com.sec.android.app.shealth)',
            'other.app'
        ]);
    });

    it('distinguishes empty and delayed summaries', () => {
        expect(isActivitySummaryEmpty(summary)).toBe(false);
        expect(isActivitySummaryEmpty({
            ...summary,
            steps: null,
            active_calories_kcal: null,
            total_calories_kcal: null,
            exercise_minutes: null
        })).toBe(true);
        expect(isActivitySummaryDelayed(summary, true, new Date('2026-07-11T17:00:01.000Z'))).toBe(true);
        expect(isActivitySummaryDelayed(summary, false, new Date('2026-07-12T17:00:01.000Z'))).toBe(false);
    });
});
