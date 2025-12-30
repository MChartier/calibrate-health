export type OnboardingStepKey = 'goals' | 'about';

export type OnboardingStep = {
    key: OnboardingStepKey;
    label: string;
};

export type GoalsQuestionKey = 'currentWeight' | 'targetWeight' | 'pace';

export type AboutQuestionKey = 'dob' | 'sex' | 'activityLevel' | 'height';
