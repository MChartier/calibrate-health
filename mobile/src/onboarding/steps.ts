export type OnboardingStepKey =
    | 'goal'
    | 'pace'
    | 'about'
    | 'burn'
    | 'import'
    | 'health'
    | 'watch'
    | 'review';

export type OnboardingStep = {
    key: OnboardingStepKey;
    label: string;
    title: string;
    description: string;
};

const REQUIRED_STEPS: OnboardingStep[] = [
    {
        key: 'goal',
        label: 'Goal',
        title: 'Choose your weight goal',
        description: 'Start with where you are today and where you want to go.'
    },
    {
        key: 'pace',
        label: 'Pace',
        title: 'Set a sustainable pace',
        description: 'This controls the calorie target we calculate each day.'
    },
    {
        key: 'about',
        label: 'You',
        title: 'Tell us the basics',
        description: 'Age and sex help estimate baseline calorie burn.'
    },
    {
        key: 'burn',
        label: 'Burn',
        title: 'Estimate calorie burn',
        description: 'Height, activity, and time zone keep daily targets accurate.'
    },
    {
        key: 'import',
        label: 'Import',
        title: 'Bring in history',
        description: 'Optional. Import Lose It data now or do it later from Account.'
    }
];

const ANDROID_CONNECTION_STEPS: OnboardingStep[] = [
    {
        key: 'health',
        label: 'Health',
        title: 'Connect Health Connect',
        description: 'Optional. Import activity from Health Connect, or set this up later in Settings.'
    },
    {
        key: 'watch',
        label: 'Watch',
        title: 'Connect your watch',
        description: 'Optional. Pair the Calibrate Wear OS app now, or return to this from Settings.'
    }
];

const REVIEW_STEP: OnboardingStep = {
    key: 'review',
    label: 'Review',
    title: 'Review your setup',
    description: 'Save the details used for your initial calorie target before optional connections.'
};

/** Native integrations belong only in Android onboarding; web keeps the core setup sequence. */
export function getOnboardingSteps(platform: string): OnboardingStep[] {
    return platform === 'android'
        ? [...REQUIRED_STEPS, REVIEW_STEP, ...ANDROID_CONNECTION_STEPS]
        : [...REQUIRED_STEPS, REVIEW_STEP];
}

export function isOptionalConnectionStep(step: OnboardingStepKey): boolean {
    return step === 'health' || step === 'watch';
}

export function getNextButtonTitle(nextStep?: OnboardingStepKey): string {
    if (!nextStep) return 'Finish setup';

    switch (nextStep) {
        case 'pace':
            return 'Next: Pace';
        case 'about':
            return 'Next: About you';
        case 'burn':
            return 'Next: Calorie burn';
        case 'import':
            return 'Next: Import';
        case 'health':
            return 'Next: Health Connect';
        case 'watch':
            return 'Next: Watch';
        case 'review':
            return 'Review setup';
        default:
            return 'Continue';
    }
}
