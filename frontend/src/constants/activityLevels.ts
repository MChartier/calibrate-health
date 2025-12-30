export type ActivityLevelValue = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';

export type ActivityLevelOption = {
    value: ActivityLevelValue;
    /** Short, scannable title shown in the closed <Select /> input. */
    title: string;
    /** Longer description shown inside the dropdown list for mobile readability. */
    description: string;
    /** Legacy one-line label used in places that still expect a compact string. */
    label: string;
};

/**
 * Activity level options used to estimate TDEE (BMR * activity multiplier).
 *
 * Keep titles short for the input field, and push detail into `description` so the dropdown
 * remains readable on narrow screens.
 */
export const activityLevelOptions: ActivityLevelOption[] = [
    {
        value: 'SEDENTARY',
        title: 'Sedentary',
        description: 'Mostly seated, <5k steps/day, little structured exercise',
        label: 'Sedentary — mostly seated, <5k steps/day, little structured exercise'
    },
    {
        value: 'LIGHT',
        title: 'Light',
        description: 'Light exercise 1–3x/week or ~5–7.5k steps/day',
        label: 'Light — light exercise 1–3x/week or ~5–7.5k steps/day'
    },
    {
        value: 'MODERATE',
        title: 'Moderate',
        description: 'Exercise 3–5x/week or ~7.5–10k steps/day',
        label: 'Moderate — exercise 3–5x/week or ~7.5–10k steps/day'
    },
    {
        value: 'ACTIVE',
        title: 'Active',
        description: 'Hard exercise 6–7x/week or >10k steps/day',
        label: 'Active — hard exercise 6–7x/week or >10k steps/day'
    },
    {
        value: 'VERY_ACTIVE',
        title: 'Very active',
        description: 'Physical job plus frequent hard exercise',
        label: 'Very Active — physical job plus frequent hard exercise'
    }
];
