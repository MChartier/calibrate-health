import {
    getNextButtonTitle,
    getOnboardingSteps,
    isOptionalConnectionStep,
    isPostCompletionStep
} from './steps';

describe('mobile onboarding steps', () => {
    it('keeps the required setup ordered and places optional work after confirmation', () => {
        expect(getOnboardingSteps('android').map(({ key }) => key)).toEqual([
            'goal',
            'about',
            'burn',
            'pace',
            'review',
            'import',
            'health',
            'watch'
        ]);
        expect(isPostCompletionStep('import')).toBe(true);
        expect(isPostCompletionStep('health')).toBe(true);
        expect(isPostCompletionStep('review')).toBe(false);
        expect(isOptionalConnectionStep('health')).toBe(true);
        expect(isOptionalConnectionStep('watch')).toBe(true);
        expect(getNextButtonTitle('health')).toBe('Next: Health Connect');
        expect(getNextButtonTitle('watch')).toBe('Next: Watch');
        expect(getNextButtonTitle()).toBe('Finish setup');
    });

    it.each(['web', 'ios'])('does not expose Android-only connections on %s', (platform) => {
        const steps = getOnboardingSteps(platform).map(({ key }) => key);

        expect(steps).not.toContain('health');
        expect(steps).not.toContain('watch');
        expect(steps.slice(0, 5)).toEqual(['goal', 'about', 'burn', 'pace', 'review']);
        expect(steps.at(-1)).toBe('import');
    });
});
