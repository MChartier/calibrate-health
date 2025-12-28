import React from 'react';
import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Avatar,
    Box,
    Divider,
    Skeleton,
    Stack,
    Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMoreRounded';
import { alpha, useTheme } from '@mui/material/styles';
import { MEAL_PERIOD_LABELS, MEAL_PERIOD_ORDER, type MealPeriod } from '../types/mealPeriod';
import { getMealPeriodAccentColor } from '../utils/mealColors';
import SectionHeader from '../ui/SectionHeader';
import MealPeriodIcon from './MealPeriodIcon';

const SKELETON_ROW_COUNT = 2;

/**
 * FoodLogMealsSkeleton
 *
 * Shaped loading placeholder for the /log food section.
 *
 * - Keeps the stable "meal period" chrome (labels + icons) rendered immediately.
 * - Uses skeleton rows for totals + entries so date navigation feels responsive without flashing
 *   misleading empty-state copy ("No entries yet.").
 */
const FoodLogMealsSkeleton: React.FC = () => {
    const theme = useTheme();
    const sectionGap = theme.custom.layout.page.sectionGap;

    const meals: Array<{ key: MealPeriod; label: string }> = MEAL_PERIOD_ORDER.map((key) => ({
        key,
        label: MEAL_PERIOD_LABELS[key]
    }));

    return (
        <Box sx={{ pointerEvents: 'none' }}>
            <Stack spacing={sectionGap} useFlexGap>
                <SectionHeader title="Food Log" align="center" />

                {meals.map((meal) => {
                    const accentColor = getMealPeriodAccentColor(theme, meal.key);
                    const avatarBg = alpha(accentColor, theme.palette.mode === 'dark' ? 0.16 : 0.1);

                    return (
                        <Accordion key={meal.key} expanded variant="outlined" disableGutters>
                            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ opacity: 0.35 }} />}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
                                    <Avatar
                                        sx={{
                                            width: 28,
                                            height: 28,
                                            bgcolor: avatarBg,
                                            border: (t) => `1px solid ${t.palette.divider}`
                                        }}
                                        variant="rounded"
                                    >
                                        <MealPeriodIcon mealPeriod={meal.key} />
                                    </Avatar>
                                    <Typography sx={{ fontWeight: 'bold' }}>{meal.label}</Typography>
                                </Box>

                                <Skeleton width={88} height={24} />
                            </AccordionSummary>

                            <AccordionDetails>
                                <Stack divider={<Divider flexItem />} spacing={1}>
                                    {Array.from({ length: SKELETON_ROW_COUNT }).map((_, idx) => (
                                        <Box
                                            key={idx}
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 1
                                            }}
                                        >
                                            <Skeleton width={`${58 + idx * 10}%`} height={22} />
                                            <Skeleton width={76} height={22} />
                                        </Box>
                                    ))}
                                </Stack>
                            </AccordionDetails>
                        </Accordion>
                    );
                })}
            </Stack>
        </Box>
    );
};

export default FoodLogMealsSkeleton;
