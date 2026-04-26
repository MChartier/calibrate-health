import React, { useMemo } from 'react';
import { Box, Chip, Skeleton, Stack, Typography } from '@mui/material';
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

const CALORIE_SUMMARY_GRID_GAP = { xs: 1.5, sm: 2, lg: 2.75 }; // Gap between the primary remaining number and supporting budget context.
const CALORIE_BUDGET_BAR_HEIGHT_PX = 10; // Thin secondary target indicator beneath logged/target values.
const CALORIE_BUDGET_STATUS_CAP_WIDTH_PX = 18; // Small warning/over cap keeps the in-budget portion green.
const CALORIE_SUMMARY_MIN_HEIGHT_PX = { md: 166, lg: 178 }; // Matches the weight card row without forcing mobile height.
const CALORIE_BIG_NUMBER_WIDTH_CH = 3.25; // Stable numeric width without forcing the primary phrase to wrap early.

type BudgetBarProps = {
    value: number;
    status: DailyCalorieStatus;
    ariaLabel: string;
};

function getStatusChipColor(status: DailyCalorieStatus): 'success' | 'warning' | 'error' | 'default' {
    switch (status) {
        case 'onTrack':
            return 'success';
        case 'warning':
            return 'warning';
        case 'over':
            return 'error';
        default:
            return 'default';
    }
}

function getPaletteColor(theme: Theme, color: 'success' | 'warning' | 'error' | 'default') {
    return color === 'default' ? theme.palette.text.secondary : theme.palette[color].main;
}

function getStatusLabel(status: DailyCalorieStatus, t: ReturnType<typeof useI18n>['t']): string {
    switch (status) {
        case 'onTrack':
            return t('today.status.onTrack');
        case 'warning':
            return t('today.status.warning');
        case 'over':
            return t('today.status.over');
        default:
            return t('today.status.unknown');
    }
}

function getRemainingSupportText(args: {
    isError: boolean;
    isSelectedToday: boolean;
    remainingCalories: number | null;
    status: DailyCalorieStatus;
    t: ReturnType<typeof useI18n>['t'];
}): string {
    if (args.isError) return args.t('today.feedback.error');
    if (args.remainingCalories === null) return args.t('today.feedback.missingTarget');
    if (args.status === 'over') {
        return args.isSelectedToday ? args.t('today.calories.overToday') : args.t('today.calories.overSelectedDay');
    }
    return args.isSelectedToday ? args.t('today.calories.remainingToday') : args.t('today.calories.remainingSelectedDay');
}

const BudgetBar: React.FC<BudgetBarProps> = ({ value, status, ariaLabel }) => {
    const boundedValue = Math.max(0, Math.min(100, value));
    const showStateCap = status === 'warning' || status === 'over';
    const stateCapColor = status === 'over' ? 'error.main' : 'warning.main';

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
                    bgcolor: 'success.main'
                }}
            />
            {showStateCap && (
                <Box
                    aria-hidden
                    sx={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: CALORIE_BUDGET_STATUS_CAP_WIDTH_PX,
                        maxWidth: '18%',
                        height: '100%',
                        bgcolor: stateCapColor
                    }}
                />
            )}
        </Box>
    );
};

/**
 * Dominant daily calorie feedback for the Today workspace.
 */
const CalorieSummary: React.FC<CalorieSummaryProps> = ({ date, isSelectedToday, sx }) => {
    const { t } = useI18n();
    const theme = useTheme();
    const foodQuery = useFoodLogQuery(date);
    const profileQuery = useUserProfileQuery();

    const totalCalories = useMemo(() => {
        return (foodQuery.data ?? []).reduce((total, entry) => total + entry.calories, 0);
    }, [foodQuery.data]);

    const summary = getDailyCalorieSummary(totalCalories, profileQuery.data?.calorieSummary?.dailyCalorieTarget);
    const statusColor = getStatusChipColor(summary.status);
    const statusPaletteColor = getPaletteColor(theme, statusColor);
    const isLoading = foodQuery.isLoading || profileQuery.isLoading;
    const isError = foodQuery.isError || profileQuery.isError;
    const gaugeValue = isLoading || isError || summary.dailyTarget === null ? 0 : summary.progressPercent;
    const loggedCaloriesLabel = isLoading || isError ? '-' : totalCalories.toLocaleString();
    const targetCaloriesLabel = summary.dailyTarget !== null ? summary.dailyTarget.toLocaleString() : '-';
    const loggedTargetLine = t('today.calories.loggedTargetLine', {
        logged: loggedCaloriesLabel,
        target: targetCaloriesLabel
    });
    const eatenLabel = t('today.calories.eatenValue', { value: loggedCaloriesLabel });
    const targetLabel = t('today.calories.targetValue', { value: targetCaloriesLabel });

    const supportText = getRemainingSupportText({
        isError,
        isSelectedToday,
        remainingCalories: summary.remainingCalories,
        status: summary.status,
        t
    });
    const statusLabel = getStatusLabel(summary.status, t);

    return (
        <AppCard
            sx={mergeSx({ height: { md: '100%' }, minHeight: CALORIE_SUMMARY_MIN_HEIGHT_PX }, sx)}
            contentSx={{
                p: { xs: 1.5, sm: 2, lg: 2.75 },
                '&:last-child': { pb: { xs: 1.5, sm: 2, lg: 2.75 } },
                height: { md: '100%' },
                display: { md: 'flex' },
                flexDirection: { md: 'column' },
                justifyContent: { md: 'center' }
            }}
        >
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'minmax(220px, 0.82fr) minmax(260px, 1fr)'
                    },
                    alignItems: 'center',
                    gap: CALORIE_SUMMARY_GRID_GAP
                }}
            >
                <Stack
                    spacing={1.1}
                    sx={{
                        minWidth: 0,
                        alignItems: 'flex-start',
                        textAlign: 'left'
                    }}
                >
                    {isLoading ? (
                        <Skeleton width="62%" height={72} />
                    ) : (
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'baseline',
                                justifyContent: { xs: 'flex-start', sm: 'center' },
                                gap: 1,
                                flexWrap: 'wrap'
                            }}
                        >
                            <Typography
                                variant="h1"
                                sx={{
                                    color: statusPaletteColor,
                                    lineHeight: 1,
                                    minWidth: `${CALORIE_BIG_NUMBER_WIDTH_CH}ch`,
                                    fontSize: { xs: '3.65rem', sm: '4.6rem', lg: '5.2rem' }
                                }}
                            >
                                {summary.remainingCalories !== null ? Math.abs(summary.remainingCalories).toLocaleString() : '-'}
                            </Typography>
                            <Box
                                sx={{
                                    display: 'inline-flex',
                                    alignItems: 'baseline',
                                    gap: 0.75,
                                    whiteSpace: 'nowrap',
                                    minWidth: 0
                                }}
                            >
                                <Typography variant="h6" sx={{ color: 'text.secondary', fontWeight: 850 }}>
                                    {t('today.calories.unit')}
                                </Typography>
                                <Typography variant="body1" sx={{ color: 'text.secondary', fontWeight: 750 }}>
                                    {supportText}
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    <Box
                        sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: { xs: 'flex-start', sm: 'flex-start' },
                            gap: 1,
                            flexWrap: 'wrap'
                        }}
                    >
                        <Chip
                            size="small"
                            color={statusColor}
                            variant={summary.status === 'unknown' ? 'outlined' : 'filled'}
                            label={statusLabel}
                            sx={
                                summary.status === 'warning'
                                    ? {
                                        bgcolor: 'warning.main',
                                        color: (theme) => theme.palette.getContrastText(theme.palette.warning.main)
                                    }
                                    : undefined
                            }
                        />
                    </Box>
                </Stack>

                <Stack spacing={1.25} sx={{ minWidth: 0 }}>
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: { xs: 1.25, sm: 2 }
                        }}
                    >
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                                {t('today.calories.logged')}
                            </Typography>
                            <Typography variant="subtitle2">{eatenLabel}</Typography>
                        </Box>
                        <Box sx={{ minWidth: 0, textAlign: 'right' }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 800 }}>
                                {t('today.calories.target')}
                            </Typography>
                            <Typography variant="subtitle2">{targetLabel}</Typography>
                        </Box>
                    </Box>

                    <BudgetBar value={gaugeValue} status={summary.status} ariaLabel={loggedTargetLine} />
                </Stack>
            </Box>
        </AppCard>
    );
};

export default CalorieSummary;
