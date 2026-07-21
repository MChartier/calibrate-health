import type { GoalEntry } from '@calibrate/api-client';
import {
    DAILY_GOAL_CHANGE_OPTIONS,
    formatDailyGoalChange,
    formatGoalSummary,
    getDailyGoalChangeCopy,
    getGoalModeFromDailyDeficit,
    getSignedDailyDeficit
} from './goals';

function createGoal(dailyDeficit: number, targetWeight = 150): GoalEntry {
    return {
        id: 1,
        start_weight: 175,
        target_weight: targetWeight,
        target_date: null,
        daily_deficit: dailyDeficit,
        created_at: '2026-07-20T00:00:00.000Z'
    };
}

describe('goal summary', () => {
    it('describes loss, gain, and maintenance goals concisely', () => {
        expect(formatGoalSummary(createGoal(500), 'LB')).toBe('Lose to 150 lb | 500 kcal/day deficit');
        expect(formatGoalSummary(createGoal(-250, 82), 'KG')).toBe('Gain to 82 kg | 250 kcal/day surplus');
        expect(formatGoalSummary(createGoal(0, 168), 'LB')).toBe('Maintain around 168 lb');
    });

    it('handles accounts without a goal', () => {
        expect(formatGoalSummary(null, 'LB')).toBe('No active goal set');
    });

    it('shares goal direction and pace copy between onboarding and goal editing', () => {
        expect(DAILY_GOAL_CHANGE_OPTIONS).toEqual([250, 500, 750, 1000]);
        expect(getGoalModeFromDailyDeficit(undefined)).toBe('maintain');
        expect(getGoalModeFromDailyDeficit(500)).toBe('lose');
        expect(getGoalModeFromDailyDeficit(-250)).toBe('gain');
        expect(getSignedDailyDeficit('gain', '500')).toBe(-500);
        expect(getDailyGoalChangeCopy('gain', '500').label).toBe('500 kcal/day surplus');
        expect(formatDailyGoalChange(500)).toBe('500 kcal/day deficit');
    });
});
