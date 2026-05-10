import React from 'react';
import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import type { MealPeriod } from '../types/mealPeriod';
import { useFoodLogQuery } from '../queries/foodLog';
import AppCard from '../ui/AppCard';
import FoodLogMeals from './FoodLogMeals';
import { useI18n } from '../i18n/useI18n';
import { APP_PAGE_AVAILABLE_HEIGHT_CSS_VAR } from '../ui/layoutCssVars';

export type FoodLogProps = {
    date: string;
    isSelectedToday: boolean;
    onAddFood: (mealPeriod?: MealPeriod | null) => void;
    /**
     * Let the Today workspace control this card's height on desktop.
     * The focused Log route stays naturally sized for a long mobile-friendly task flow.
     */
    constrainTimelineOnDesktop?: boolean;
    /**
     * Stretch the card to fill an assigned grid row and scroll the meal timeline internally.
     */
    fillAvailableHeight?: boolean;
};

const TODAY_WORKSPACE_FOOD_LOG_HEIGHT = {
    md: `clamp(430px, calc(var(${APP_PAGE_AVAILABLE_HEIGHT_CSS_VAR}, 100svh) - 360px), 560px)`,
    lg: `clamp(480px, calc(var(${APP_PAGE_AVAILABLE_HEIGHT_CSS_VAR}, 100svh) - 360px), 620px)`,
    xl: `clamp(520px, calc(var(${APP_PAGE_AVAILABLE_HEIGHT_CSS_VAR}, 100svh) - 370px), 660px)`
}; // Bounds the desktop food log so the page stays compact while the meal list scrolls internally.
const FOOD_LOG_MIN_FILL_HEIGHT_PX = { md: 360, lg: 400 }; // Minimum useful timeline height when the dashboard grid assigns available space.

/**
 * Daily food log surface for the Today workspace and full Log route.
 */
const FoodLog: React.FC<FoodLogProps> = ({
    date,
    isSelectedToday,
    onAddFood,
    constrainTimelineOnDesktop = false,
    fillAvailableHeight = false
}) => {
    const { t } = useI18n();
    const foodQuery = useFoodLogQuery(date);
    const usesInternalScroll = constrainTimelineOnDesktop || fillAvailableHeight;
    let cardSx: SxProps<Theme> | undefined;
    if (fillAvailableHeight) {
        cardSx = {
            height: '100%',
            minHeight: { md: FOOD_LOG_MIN_FILL_HEIGHT_PX.md, lg: FOOD_LOG_MIN_FILL_HEIGHT_PX.lg }
        };
    } else if (constrainTimelineOnDesktop) {
        cardSx = {
            height: TODAY_WORKSPACE_FOOD_LOG_HEIGHT
        };
    }

    return (
        <AppCard
            sx={cardSx}
            contentSx={{
                p: { xs: 1.25, sm: 1.75 },
                '&:last-child': { pb: { xs: 1.25, sm: 1.75 } },
                ...(usesInternalScroll
                    ? {
                        display: { md: 'flex' },
                        flexDirection: { md: 'column' },
                        minHeight: 0,
                        height: { md: '100%' }
                    }
                    : null)
            }}
        >
            <Stack spacing={1.25} sx={usesInternalScroll ? { minHeight: 0, height: { md: '100%' } } : undefined}>
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1,
                        flexWrap: 'wrap'
                    }}
                >
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h6">
                            {isSelectedToday ? t('today.foodLog.title') : t('today.foodLog.titleForDate')}
                        </Typography>
                    </Box>
                </Box>

                {foodQuery.isError ? (
                    <Alert
                        severity="error"
                        action={
                            <Button color="inherit" size="small" onClick={() => void foodQuery.refetch()}>
                                {t('common.retry')}
                            </Button>
                        }
                    >
                        {t('log.foodLog.error')}
                    </Alert>
                ) : (
                    <Box
                        sx={
                            usesInternalScroll
                                ? {
                                    flex: { md: 1 },
                                    minHeight: 0,
                                    overflowY: 'auto',
                                    overscrollBehavior: 'contain',
                                    pr: { md: 0.5 },
                                    mr: { md: -0.5 },
                                    scrollbarWidth: 'thin',
                                    scrollbarColor: (theme) => `${theme.palette.divider} transparent`,
                                    '&::-webkit-scrollbar': {
                                        width: 8
                                    },
                                    '&::-webkit-scrollbar-thumb': {
                                        borderRadius: 999,
                                        backgroundColor: 'divider'
                                    },
                                    '&::-webkit-scrollbar-track': {
                                        backgroundColor: 'transparent'
                                    }
                                }
                                : undefined
                        }
                    >
                        <FoodLogMeals
                            logs={foodQuery.data ?? []}
                            isLoading={foodQuery.isLoading}
                            onAddMeal={(mealPeriod) => onAddFood(mealPeriod)}
                        />
                    </Box>
                )}

                <Button
                    variant="contained"
                    size="large"
                    startIcon={<AddRoundedIcon />}
                    onClick={() => onAddFood(null)}
                    fullWidth
                    sx={{
                        mt: 0.25,
                        py: 1.35,
                        boxShadow: (theme) => `0 12px 26px ${theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.36)' : 'rgba(46,125,50,0.24)'}`
                    }}
                >
                    {t('today.addFood')}
                </Button>
            </Stack>
        </AppCard>
    );
};

export default FoodLog;
