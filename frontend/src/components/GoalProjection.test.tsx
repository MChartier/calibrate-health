// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateValue } from '../utils/goalTracking';
import GoalProjection from './GoalProjection';

type QueryState = {
    data: unknown;
    isLoading: boolean;
    isError: boolean;
};

const testState = vi.hoisted(() => ({
    goalQuery: { data: null, isLoading: false, isError: false } as QueryState,
    metricsQuery: { data: [], isLoading: false, isError: false } as QueryState,
    weightUnit: 'LB'
}));

vi.mock('@tanstack/react-query', () => ({
    useQuery: ({ queryKey }: { queryKey: string[] }) =>
        queryKey[0] === 'goal' ? testState.goalQuery : testState.metricsQuery
}));

vi.mock('../context/useAuth', () => ({
    useAuth: () => ({ user: { weight_unit: testState.weightUnit } })
}));

const translations: Record<string, string> = {
    'today.goalProjection.title': 'Goal projection',
    'goalTracker.cta.setGoal': 'Set a goal',
    'goalTracker.cta.setNewGoal': 'Set a new goal',
    'goalTracker.dialog.title.newGoal': 'Set a new goal',
    'goalTracker.dialog.title.firstGoal': 'Set your first goal',
    'goalTracker.dialog.title.editGoalFallback': 'Edit goal',
    'goalTracker.dialog.submit.newGoal': 'Save new goal',
    'goalTracker.dialog.submit.saveGoal': 'Save goal',
    'goalTracker.error.unableToLoad': 'Unable to load goal progress.',
    'goalTracker.empty.noGoal': 'No goal set yet.',
    'goalTracker.empty.setTargetHint': 'Set a target weight to start tracking progress.',
    'goalTracker.status.logWeighIn': 'Log a weigh-in',
    'goalTracker.status.onTarget': 'On target',
    'goalTracker.status.above': 'above',
    'goalTracker.status.below': 'below',
    'goalTracker.label.target': 'Target {value} {unit}',
    'goalTracker.label.tolerance': '+/-{value} {unit}',
    'goalTracker.label.current': 'Current {weight}',
    'goalTracker.label.start': 'Start {value} {unit}',
    'goalTracker.label.goal': 'Goal {value} {unit}',
    'goalTracker.label.projected': 'Projected: {date}',
    'goalTracker.label.projectedMissing': 'Projected: -',
    'goalTracker.label.projectedPaceToday': 'On pace to hit your goal today.',
    'goalTracker.label.projectedPaceDays': 'On pace to hit your goal in about {count} days.',
    'goalTracker.label.projectedPaceWeeks': 'On pace to hit your goal in about {count} weeks.',
    'goalTracker.success.maintain': "Nice work! You're on target for {target} {unit}.",
    'goalTracker.success.other': "Congratulations! You've met or exceeded your goal of {target} {unit}.",
    'goalTracker.aria.onTargetRange': 'On-target range',
    'goalTracker.aria.targetMarker': 'Target marker',
    'goalTracker.aria.currentWeightMarker': 'Current weight marker',
    'goalTracker.aria.currentProgressMarker': 'Current progress marker',
    'goalTracker.aria.progressPercent': 'Percent progress toward goal'
};

vi.mock('../i18n/useI18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, string | number>) => {
            let value = translations[key] ?? key;
            for (const [name, replacement] of Object.entries(params ?? {})) {
                value = value.replace(`{${name}}`, String(replacement));
            }
            return value;
        }
    })
}));

vi.mock('./GoalEditor', () => ({
    default: ({
        initialStartWeight,
        initialTargetWeight,
        initialDailyDeficit
    }: {
        initialStartWeight: number | null;
        initialTargetWeight: number | null;
        initialDailyDeficit: number | null;
    }) => (
        <div data-testid="goal-editor">
            Start: {initialStartWeight ?? 'none'} | Target: {initialTargetWeight ?? 'none'} | Change:{' '}
            {initialDailyDeficit ?? 'none'}
        </div>
    )
}));

function setGoalQuery(data: unknown, overrides: Partial<QueryState> = {}) {
    testState.goalQuery = { data, isLoading: false, isError: false, ...overrides };
}

function setMetricsQuery(data: unknown, overrides: Partial<QueryState> = {}) {
    testState.metricsQuery = { data, isLoading: false, isError: false, ...overrides };
}

describe('GoalProjection', () => {
    beforeEach(() => {
        setGoalQuery(null);
        setMetricsQuery([]);
        testState.weightUnit = 'LB';
        vi.useRealTimers();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('keeps goal editing unavailable while either projection dependency is loading', () => {
        setGoalQuery(null, { isLoading: true });

        render(<GoalProjection />);

        expect(screen.getByText('Goal projection')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Set a goal' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.queryByText('No goal set yet.')).toBeNull();
    });

    it('shows a recoverable message when goal or weigh-in data cannot load', () => {
        setMetricsQuery(undefined, { isError: true });

        render(<GoalProjection />);

        expect(screen.getByText('Unable to load goal progress.')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Set a goal' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('explains the empty state and seeds the first-goal editor from the latest weigh-in', async () => {
        setMetricsQuery([{ id: 4, date: '2026-07-12', weight: 187.5 }]);
        const user = userEvent.setup();

        render(<GoalProjection />);

        expect(screen.getByText('No goal set yet.')).toBeTruthy();
        expect(screen.getByText('Set a target weight to start tracking progress.')).toBeTruthy();

        await user.click(screen.getByRole('button', { name: 'Set a goal' }));

        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByText('Set your first goal')).toBeTruthy();
        expect(screen.getByTestId('goal-editor').textContent).toContain('Start: 187.5 | Target: none | Change: 500');
    });

    it('renders weight-loss progress and a projected date from the latest weigh-in', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 0, 10, 12));
        setGoalQuery({
            start_weight: 200,
            target_weight: 180,
            target_date: null,
            daily_deficit: 500,
            created_at: '2026-01-01T12:00:00.000Z'
        });
        setMetricsQuery([{ id: 8, date: '2026-01-10', weight: 190 }]);

        render(<GoalProjection />);

        expect(screen.getByText('Start 200.0 lb')).toBeTruthy();
        expect(screen.getByText('Goal 180.0 lb')).toBeTruthy();
        expect(screen.getByText('Current 190.0 lb')).toBeTruthy();
        expect(screen.getByLabelText('Percent progress toward goal').textContent).toBe('50%');
        expect(screen.getByLabelText('Current progress marker')).toBeTruthy();
        expect(screen.getByText('On pace to hit your goal in about 10 weeks.')).toBeTruthy();
        expect(screen.getByText(`Projected: ${formatDateValue(new Date(2026, 2, 21))}`)).toBeTruthy();
    });

    it('surfaces an unavailable projection when the calorie direction contradicts the goal', () => {
        setGoalQuery({
            start_weight: 180,
            target_weight: 190,
            target_date: null,
            daily_deficit: 500,
            created_at: '2026-01-01T12:00:00.000Z'
        });

        render(<GoalProjection />);

        const unavailable = screen.getByText('Projected: -');
        expect(unavailable.getAttribute('title')).toContain('implies weight loss');
        expect(screen.getByText('Log a weigh-in')).toBeTruthy();
    });

    it('shows maintenance tolerance and celebrates a current weight inside it', () => {
        testState.weightUnit = 'KG';
        setGoalQuery({
            start_weight: 75,
            target_weight: 75,
            target_date: null,
            daily_deficit: 0,
            created_at: '2026-01-01T12:00:00.000Z'
        });
        setMetricsQuery([{ id: 12, date: '2026-07-12', weight: 75.4 }]);

        render(<GoalProjection />);

        expect(screen.getByRole('alert').textContent).toContain("Nice work! You're on target for 75.0 kg.");
        expect(screen.getByText('Target 75.0 kg')).toBeTruthy();
        expect(screen.getByText('+/-0.5 kg')).toBeTruthy();
        expect(screen.getByText('Current 75.4 kg')).toBeTruthy();
        expect(screen.getByText('On target')).toBeTruthy();
        expect(screen.getByLabelText('On-target range')).toBeTruthy();
        expect(screen.getByLabelText('Target marker')).toBeTruthy();
        expect(screen.getByLabelText('Current weight marker')).toBeTruthy();
    });
});
