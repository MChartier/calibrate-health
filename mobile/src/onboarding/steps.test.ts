import {
    getNextButtonTitle,
    getOnboardingSteps,
    isOptionalConnectionStep
} from './steps';

describe('mobile onboarding steps', () => {
    it('places optional Android connections after the required setup review', () => {
        expect(getOnboardingSteps('android').map(({ key }) => key)).toEqual([
            'goal',
            'pace',
            'about',
            'burn',
            'import',
            'review',
            'health',
            'watch'
        ]);
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
        expect(steps.at(-1)).toBe('review');
    });
});
