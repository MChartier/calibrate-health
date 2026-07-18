import React from 'react';
import { render } from '@testing-library/react-native';
import { OnboardingProgress } from './OnboardingProgress';
import { getOnboardingSteps } from './steps';

describe('OnboardingProgress', () => {
    const steps = getOnboardingSteps('android');

    it('presents the sequence as one continuous accessible progress bar', () => {
        const screen = render(
            <OnboardingProgress
                steps={steps}
                activeIndex={2}
            />
        );

        expect(screen.getByText('Step 3 of 8')).toBeTruthy();
        expect(screen.getByRole('progressbar', { name: 'Onboarding progress' }).props.accessibilityValue).toEqual({
            min: 1,
            max: 8,
            now: 3,
            text: 'Step 3 of 8'
        });
    });

    it('calls out Android connection steps as optional', () => {
        const screen = render(
            <OnboardingProgress
                steps={steps}
                activeIndex={6}
            />
        );

        expect(screen.getByText('Step 7 of 8')).toBeTruthy();
        expect(screen.getByText('Optional connection')).toBeTruthy();
        expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual(
            expect.objectContaining({ now: 7, text: 'Step 7 of 8' })
        );
    });
});
