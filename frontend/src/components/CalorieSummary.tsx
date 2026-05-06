import React, { useMemo } from 'react';
import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import type { SxProps } from '@mui/material/styles';
import type { Theme } from '@mui/material/styles';
import { useFoodLogQuery } from '../queries/foodLog';
import { useUserProfileQuery } from '../queries/userProfile';
import { getDailyCalorieSummary, type DailyCalorieStatus } from '../utils/dailyCalories';
import AppCard from '../ui/AppCard';
import { useI18n } from '../i18n/useI18n';
import { mergeSx } from '../ui/sx';

export type CalorieSummaryProps = {
    date: string;
    isSelectedToday: boolean;
    /** Optional wrapper styles used by dashboard grid alignment. */
    sx?: SxProps<Theme>;
};

const CALORIE_SUMMARY_STACK_GAP = { xs: 1.25, sm: 1.5 }; // Keeps the calorie card as one statement: value, bar, support line.
const CALORIE_BUDGET_BAR_HEIGHT_PX = 12; // Slightly thicker so state color carries meaning without a separate chip.
const CALORIE_SUMMARY_MIN_HEIGHT_PX = { md: 144, lg: 154 }; // Keeps desktop first row useful without overpowering the food log below.
const CALORIE_BIG_NUMBER_WIDTH_CH = 3.25; // Stable numeric width without forcing the primary phrase to wrap early.
const CALORIE_PROGRESS_WARNING_PERCENT = 80; // Budget shifts from "plenty left" into caution as the user passes 80% consumed.
const CALORIE_PROGRESS_NEAR_LIMIT_PERCENT = 95; // Near-limit state starts before the target is fully consumed.
const CALORIE_PROGRESS_WARNING_COLOR = '#EAB308'; // Yellow caution distinct from the app's warmer warning orange.
const CALORIE_PROGRESS_NEAR_LIMIT_COLOR = '#F97316'; // Orange communicates the final stretch before over-target red.

type CalorieBudgetTone = 'success' | 'warning' | 'nearLimit' | 'error' | 'default';

type BudgetBarProps = {
    value: number;
    tone: CalorieBudgetTone;
    ariaLabel: string;
};

function getBudgetTone(args: { progressPercent: number; status: DailyCalorieStatus }): CalorieBudgetTone {
    if (args.status === 'unknown') return 'default';
    if (args.status === 'over') return 'error';
    if (args.progressPercent >= CALORIE_PROGRESS_NEAR_LIMIT_PERCENT) return 'nearLimit';
    if (args.progressPercent >= CALORIE_PROGRESS_WARNING_PERCENT) return 'warning';
    return 'success';
}

function getToneColor(theme: Theme, tone: CalorieBudgetTone): string {
    switch (tone) {
        case 'success':
            return theme.palette.success.main;
        case 'warning':
            return CALORIE_PROGRESS_WARNING_COLOR;
        case 'nearLimit':
            return CALORIE_PROGRESS_NEAR_LIMIT_COLOR;
        case 'error':
            return theme.palette.error.main;
        default:
            return theme.palette.text.secondary;
    }
}

function getRemainingLabel(args: {
    isError: boolean;
    remainingCalories: number | null;
    status: DailyCalorieStatus;
    t: ReturnType<typeof useI18n>['t'];
}): string {
    if (args.isError) return args.t('today.feedback.error');
    if (args.remainingCalories === null) return args.t('today.feedback.missingTarget');
    if (args.status === 'over') return args.t('today.calories.over');
    return args.t('today.calories.left');
}

const BudgetBar: React.FC<BudgetBarProps> = ({ value, tone, ariaLabel }) => {
    const boundedValue = Math.max(0, Math.min(100, value));

    return (
        <Box
            component="div"
            role="img"
            aria-label={ariaLabel}
            sx={{
                position: 'relative',
                width: '100%',
                height: CALORIE_BUDGET_BAR_HEIGHT_PX,
                borderRadius: 999,
                overflow: 'hidden',
                bgcolor: (theme) => alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.16 : 0.1)
            }}
        >
            <Box
                aria-hidden
                sx={{
                    width: `${boundedValue}%`,
                    height: '100%',
                    borderRadius: 999,
                    bgcolor: (theme) => getToneColor(theme, tone)
                }}
            />
        </Box>
    );
};

/**
 * Dominant daily calorie feedback for the Today workspace.
 */
const CalorieSummary: React.FC<CalorieSummaryProps> = ({ date, sx }) => {
    const { t } = useI18n();
    const theme = useTheme();
    const foodQuery = useFoodLogQuery(date);
    const profileQuery = useUserProfileQuery();

    const totalCalories = useMemo(() => {
        return (foodQuery.data ?? []).reduce((total, entry) => total + entry.calories, 0);
    }, [foodQuery.data]);

    const summary = getDailyCalorieSummary(totalCalories, profileQuery.data?.calorieSummary?.dailyCalorieTarget);
    const isLoading = foodQuery.isLoading || profileQuery.isLoading;
    const isError = foodQuery.isError || profileQuery.isError;
    const gaugeValue = isLoading || isError || summary.dailyTarget === null ? 0 : summary.progressPercent;
    const budgetTone = getBudgetTone({ progressPercent: gaugeValue, status: summary.status });
    const statusPaletteColor = getToneColor(theme, budgetTone);
    const loggedCaloriesLabel = isLoading || isError ? '-' : totalCalories.toLocaleString();
    const targetCaloriesLabel = summary.dailyTarget !== null ? summary.dailyTarget.toLocaleString() : '-';
    const loggedTargetLine = t('today.calories.loggedTargetLine', {
        logged: loggedCaloriesLabel,
        target: targetCaloriesLabel
    });

    const remainingLabel = getRemainingLabel({
        isError,
        remainingCalories: summary.remainingCalories,
        status: summary.status,
        t
    });
    return (
        <AppCard
            sx={mergeSx({ height: { md: '100%' }, minHeight: CALORIE_SUMMARY_MIN_HEIGHT_PX }, sx)}
            contentSx={{
                p: { xs: 1.5, sm: 1.75, lg: 2.25 },
                '&:last-child': { pb: { xs: 1.5, sm: 1.75, lg: 2.25 } },
                height: { md: '100%' },
                display: { md: 'flex' },
                flexDirection: { md: 'column' },
                justifyContent: { md: 'center' }
            }}
        >
            <Stack spacing={CALORIE_SUMMARY_STACK_GAP} useFlexGap sx={{ minWidth: 0 }}>
                {isLoading ? (
                    <Skeleton width="62%" height={72} />
                ) : (
                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: { xs: 0.8, sm: 1 },
                            flexWrap: 'wrap'
                        }}
                    >
                        <Typography
                            variant="h1"
                            sx={{
                                color: statusPaletteColor,
                                lineHeight: 1,
                                minWidth: `${CALORIE_BIG_NUMBER_WIDTH_CH}ch`,
                                fontSize: { xs: '3.55rem', sm: '4.15rem', lg: '4.7rem' }
                            }}
                        >
                            {summary.remainingCalories !== null ? Math.abs(summary.remainingCalories).toLocaleString() : '-'}
                        </Typography>
                        <Typography variant="h5" sx={{ color: statusPaletteColor, fontWeight: 850, lineHeight: 1 }}>
                            {t('today.calories.unit')}
                        </Typography>
                        <Typography variant="h5" sx={{ color: 'text.secondary', fontWeight: 800, lineHeight: 1 }}>
                            {remainingLabel}
                        </Typography>
                    </Box>
                )}

                <BudgetBar value={gaugeValue} tone={budgetTone} ariaLabel={loggedTargetLine} />
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 750, textAlign: 'center' }}>
                    {loggedTargetLine}
                </Typography>
            </Stack>
        </AppCard>
    );
};

export default CalorieSummary;
