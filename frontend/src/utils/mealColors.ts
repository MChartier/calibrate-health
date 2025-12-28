import type { Theme } from '@mui/material/styles';
import { darken, lighten } from '@mui/material/styles';
import type { MealPeriod } from '../types/mealPeriod';

/**
 * Return an accent color for a meal period derived from the active theme.
 *
 * We keep the palette cohesive with the current app theme (light/dark + future tweaks) while still
 * providing enough distinction between meal categories for quick scanning.
 */
export function getMealPeriodAccentColor(theme: Theme, mealPeriod: MealPeriod): string {
    const isDark = theme.palette.mode === 'dark';
    const primary = theme.palette.primary.main;
    const secondary = theme.palette.secondary.main;

    // Light mode needs more contrast between categories; dark mode already uses brighter accents,
    // so we primarily create variety by shifting toward deeper tones.
    const primaryBright = isDark ? primary : lighten(primary, 0.18);
    const primaryMain = isDark ? darken(primary, 0.12) : primary;
    const primaryDeep = darken(primary, isDark ? 0.24 : 0.18);

    const secondaryBright = isDark ? secondary : lighten(secondary, 0.18);
    const secondaryMain = isDark ? darken(secondary, 0.12) : secondary;
    const secondaryDeep = darken(secondary, isDark ? 0.26 : 0.18);

    // Intentional pattern:
    // - Alternate primary/secondary by meal so adjacent sections are easy to scan.
    // - Gradually increase intensity as the day progresses (bright -> main -> deep).
    switch (mealPeriod) {
        case 'BREAKFAST':
            return primaryBright;
        case 'MORNING_SNACK':
            return secondaryBright;
        case 'LUNCH':
            return primaryMain;
        case 'AFTERNOON_SNACK':
            return secondaryMain;
        case 'DINNER':
            return primaryDeep;
        case 'EVENING_SNACK':
            return secondaryDeep;
        default:
            return primary;
    }
}
