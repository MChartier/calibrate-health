import type { Translate } from '../i18n/i18nContext';
import type { TranslationKey } from '../i18n/resources';

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

type ActivityLevelOptionTemplate = {
    value: ActivityLevelValue;
    titleKey: TranslationKey;
    descriptionKey: TranslationKey;
};

/**
 * Activity level options used to estimate TDEE (BMR * activity multiplier).
 *
 * Keep titles short for the input field, and push detail into `description` so the dropdown
 * remains readable on narrow screens.
 */
const activityLevelOptionTemplates: ActivityLevelOptionTemplate[] = [
    {
        value: 'SEDENTARY',
        titleKey: 'activityLevel.SEDENTARY.title',
        descriptionKey: 'activityLevel.SEDENTARY.description'
    },
    {
        value: 'LIGHT',
        titleKey: 'activityLevel.LIGHT.title',
        descriptionKey: 'activityLevel.LIGHT.description'
    },
    {
        value: 'MODERATE',
        titleKey: 'activityLevel.MODERATE.title',
        descriptionKey: 'activityLevel.MODERATE.description'
    },
    {
        value: 'ACTIVE',
        titleKey: 'activityLevel.ACTIVE.title',
        descriptionKey: 'activityLevel.ACTIVE.description'
    },
    {
        value: 'VERY_ACTIVE',
        titleKey: 'activityLevel.VERY_ACTIVE.title',
        descriptionKey: 'activityLevel.VERY_ACTIVE.description'
    }
];

/**
 * Build translated activity level options for UI selects.
 */
export function getActivityLevelOptions(t: Translate): ActivityLevelOption[] {
    return activityLevelOptionTemplates.map((template) => {
        const title = t(template.titleKey);
        const description = t(template.descriptionKey);

        return {
            value: template.value,
            title,
            description,
            label: `${title} - ${description}`
        };
    });
}
