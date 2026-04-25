import type { Meta, StoryObj } from '@storybook/react-vite';
import OnboardingStepDots from './OnboardingStepDots';
import type { OnboardingStep } from './types';

const steps: OnboardingStep[] = [
    { key: 'about', label: 'About you' },
    { key: 'goals', label: 'Goals' },
    { key: 'import', label: 'Import' }
];

const meta = {
    title: 'Components/Onboarding/OnboardingStepDots',
    component: OnboardingStepDots,
    parameters: {
        layout: 'padded'
    },
    args: {
        steps,
        activeStepIndex: 1
    }
} satisfies Meta<typeof OnboardingStepDots>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MiddleStep: Story = {};

export const FirstStep: Story = {
    args: {
        activeStepIndex: 0
    }
};

export const FinalStep: Story = {
    args: {
        activeStepIndex: 2
    }
};
