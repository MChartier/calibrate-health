import React from 'react';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { SxProps, Theme } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import EggAltIcon from '@mui/icons-material/EggAltRounded';
import BakeryDiningIcon from '@mui/icons-material/BakeryDiningRounded';
import IcecreamIcon from '@mui/icons-material/IcecreamRounded';
import LunchDiningIcon from '@mui/icons-material/LunchDiningRounded';
import DinnerDiningIcon from '@mui/icons-material/DinnerDiningRounded';
import NightlifeIcon from '@mui/icons-material/NightlifeRounded';
import type { MealPeriod } from '../types/mealPeriod';
import { getMealPeriodAccentColor } from '../utils/mealColors';

const MEAL_PERIOD_ICON_COMPONENTS: Record<MealPeriod, React.ElementType<SvgIconProps>> = {
    BREAKFAST: EggAltIcon,
    MORNING_SNACK: BakeryDiningIcon,
    LUNCH: LunchDiningIcon,
    AFTERNOON_SNACK: IcecreamIcon,
    DINNER: DinnerDiningIcon,
    EVENING_SNACK: NightlifeIcon
};

export type MealPeriodIconProps = Omit<SvgIconProps, 'color'> & {
    mealPeriod: MealPeriod;
    sx?: SxProps<Theme>;
};

/**
 * MealPeriodIcon
 *
 * Centralized mapping from meal period -> icon, using the theme-derived meal accent color.
 * This keeps meal iconography consistent anywhere we need to represent a meal period.
 */
const MealPeriodIcon: React.FC<MealPeriodIconProps> = ({ mealPeriod, sx, ...iconProps }) => {
    const theme = useTheme();
    const Icon = MEAL_PERIOD_ICON_COMPONENTS[mealPeriod];

    const mergedSx: SxProps<Theme> = [
        { color: getMealPeriodAccentColor(theme, mealPeriod) },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : [])
    ];

    return <Icon {...iconProps} sx={mergedSx} />;
};

export default MealPeriodIcon;

