// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GoalEditor from './GoalEditor';

const axiosMocks = vi.hoisted(() => ({
    post: vi.fn(),
    isAxiosError: vi.fn()
}));
const invalidateQueries = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('axios', () => ({ default: axiosMocks }));
vi.mock('@tanstack/react-query', () => ({
    useQueryClient: () => ({ invalidateQueries })
}));
vi.mock('../i18n/useI18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, string>) => {
            const labels: Record<string, string> = {
                'goalEditor.startWeightLabel': `Start weight (${params?.unit ?? ''})`,
                'goalEditor.targetWeightLabel': `Target weight (${params?.unit ?? ''})`,
                'goalEditor.goalType': 'Goal type',
                'goalEditor.goalType.lose': 'Lose weight',
                'goalEditor.goalType.maintain': 'Maintain weight',
                'goalEditor.goalType.gain': 'Gain weight',
                'goalEditor.dailyCalorieChange': 'Daily calorie change',
                'goalEditor.dailyChangeOption': `${params?.sign ?? ''}${params?.value ?? ''} kcal`,
                'goalEditor.success.saved': 'Goal saved.',
                'goalEditor.error.saveFailed': 'Unable to save goal.',
                'common.cancel': 'Cancel',
                'common.saving': 'Saving...'
            };
            return labels[key] ?? key;
        }
    })
}));

const defaultProps = {
    weightUnitLabel: 'lb',
    initialStartWeight: 180,
    initialTargetWeight: 170,
    initialDailyDeficit: 500,
    submitLabel: 'Save goal',
    onSaved: vi.fn()
};

async function replaceTargetWeight(value: string) {
    const user = userEvent.setup();
    const target = screen.getByLabelText(/Target weight \(lb\)/);
    await user.clear(target);
    await user.type(target, value);
    return user;
}

describe('GoalEditor interactions', () => {
    beforeEach(() => {
        axiosMocks.post.mockReset();
        axiosMocks.isAxiosError.mockReset();
        invalidateQueries.mockClear();
        defaultProps.onSaved.mockClear();
    });

    afterEach(cleanup);

    it('blocks an incoherent weight-loss goal before sending a mutation', async () => {
        render(<GoalEditor {...defaultProps} />);
        const user = await replaceTargetWeight('190');

        await user.click(screen.getByRole('button', { name: 'Save goal' }));

        expect(axiosMocks.post).not.toHaveBeenCalled();
        expect((await screen.findByRole('alert')).textContent).toContain(
            'For a weight loss goal, target weight must be less than your start weight.'
        );
    });

    it('surfaces an actionable server mutation error without reporting success', async () => {
        axiosMocks.post.mockRejectedValue({ response: { data: { message: 'Server rejected goal.' } } });
        axiosMocks.isAxiosError.mockReturnValue(true);
        render(<GoalEditor {...defaultProps} />);
        const user = await replaceTargetWeight('165');

        await user.click(screen.getByRole('button', { name: 'Save goal' }));

        expect((await screen.findByRole('alert')).textContent).toContain('Server rejected goal.');
        expect(defaultProps.onSaved).not.toHaveBeenCalled();
    });

    it('saves a valid edit and refreshes each goal-dependent query', async () => {
        axiosMocks.post.mockResolvedValue({ data: { id: 42 } });
        render(<GoalEditor {...defaultProps} />);
        const user = await replaceTargetWeight('165');

        await user.click(screen.getByRole('button', { name: 'Save goal' }));

        expect(axiosMocks.post).toHaveBeenCalledWith('/api/goals', {
            start_weight: '180',
            target_weight: '165',
            daily_deficit: 500
        });
        expect(invalidateQueries).toHaveBeenCalledTimes(3);
        expect(invalidateQueries).toHaveBeenNthCalledWith(1, { queryKey: ['goal'] });
        expect(invalidateQueries).toHaveBeenNthCalledWith(2, { queryKey: ['profile'] });
        expect(invalidateQueries).toHaveBeenNthCalledWith(3, { queryKey: ['profile-summary'] });
        expect(defaultProps.onSaved).toHaveBeenCalledTimes(1);
        expect((await screen.findByRole('alert')).textContent).toContain('Goal saved.');
    });
});
