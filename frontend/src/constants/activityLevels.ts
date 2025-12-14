export type ActivityLevelValue = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';

export const activityLevelOptions: { value: ActivityLevelValue; label: string }[] = [
    { value: 'SEDENTARY', label: 'Sedentary — mostly seated, <5k steps/day, little structured exercise' },
    { value: 'LIGHT', label: 'Light — light exercise 1–3x/week or ~5–7.5k steps/day' },
    { value: 'MODERATE', label: 'Moderate — exercise 3–5x/week or ~7.5–10k steps/day' },
    { value: 'ACTIVE', label: 'Active — hard exercise 6–7x/week or >10k steps/day' },
    { value: 'VERY_ACTIVE', label: 'Very Active — physical job plus frequent hard exercise' }
];
