import React from 'react';
import { Box, Card, CardActionArea, CardContent, Skeleton, Typography } from '@mui/material';
import { Gauge } from '@mui/x-charts/Gauge';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { formatDateToLocalDateString } from '../utils/date';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import { useTweenedNumber } from '../hooks/useTweenedNumber';
import { useUserProfileQuery } from '../queries/userProfile';
import { useFoodLogQuery } from '../queries/foodLog';

const GAUGE_WIDTH = 200;
const GAUGE_HEIGHT = 140;
const GAUGE_START_ANGLE = -90;
const GAUGE_END_ANGLE = 90;
const GAUGE_INNER_RADIUS = '70%';
const GAUGE_OUTER_RADIUS = '90%';
const SUMMARY_SKELETON_VALUE_HEIGHT = 32;

export type LogSummaryCardProps = {
    /**
     * When true, the card behaves like the dashboard version: it is clickable (navigates to `/log`)
     * and includes a call-to-action line.
     */
    dashboardMode?: boolean;
    /**
     * Local date string (`YYYY-MM-DD`) used to fetch and display the log summary.
     * Defaults to the user's local "today" (based on their profile timezone when available).
     */
    date?: string;
};

const LogSummaryCard: React.FC<LogSummaryCardProps> = ({ dashboardMode = false, date }) => {
    const { user } = useAuth();
    const timeZone = user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const today = formatDateToLocalDateString(new Date(), timeZone);
    const activeDate = date ?? today;
    const isActiveDateToday = activeDate === today;
    const title = isActiveDateToday ? "Today's Log" : `Log for ${activeDate}`;

    const foodQuery = useFoodLogQuery(activeDate);

    const profileSummaryQuery = useUserProfileQuery();

    const logs = foodQuery.data ?? [];
    const totalCalories = logs.reduce((acc, log) => acc + log.calories, 0);
    const dailyTarget = profileSummaryQuery.data?.calorieSummary?.dailyCalorieTarget;
    const remainingCalories = typeof dailyTarget === 'number' ? Math.round(dailyTarget - totalCalories) : null;
    const isOver = dailyTarget !== undefined && dailyTarget !== null && totalCalories > dailyTarget;
    const gaugeValue = dailyTarget ? (isOver ? dailyTarget : Math.max(totalCalories, 0)) : 0;
    const gaugeMax = dailyTarget ? (isOver ? totalCalories : dailyTarget) : 1;
    const gaugePercent = gaugeMax > 0 ? gaugeValue / gaugeMax : 0;

    const isLoading = foodQuery.isLoading || profileSummaryQuery.isLoading;
    const isError = foodQuery.isError || profileSummaryQuery.isError;

    const prefersReducedMotion = usePrefersReducedMotion();

    const animatedGaugePercent = useTweenedNumber(gaugePercent, {
        durationMs: 520,
        disabled: prefersReducedMotion || isLoading || isError
    });

    const remainingDisplayValue = remainingCalories !== null ? Math.abs(remainingCalories) : 0;
    const animatedRemainingDisplayValue = useTweenedNumber(remainingDisplayValue, {
        durationMs: 520,
        disabled: prefersReducedMotion || isLoading || isError || remainingCalories === null
    });

    // Split conditional branches into named nodes to keep the render tree readable.
    let cardBody: React.ReactNode;
    if (isLoading) {
        cardBody = (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    flexDirection: { xs: 'column', sm: 'row' }
                }}
            >
                <Gauge
                    width={GAUGE_WIDTH}
                    height={GAUGE_HEIGHT}
                    startAngle={GAUGE_START_ANGLE}
                    endAngle={GAUGE_END_ANGLE}
                    value={0}
                    valueMin={0}
                    valueMax={1}
                    innerRadius={GAUGE_INNER_RADIUS}
                    outerRadius={GAUGE_OUTER_RADIUS}
                    text={() => ''}
                    sx={{
                        '& .MuiGauge-referenceArc': {
                            fill: (theme) => theme.palette.grey[300]
                        },
                        '& .MuiGauge-valueArc': {
                            fill: (theme) => theme.palette.grey[200]
                        }
                    }}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flexGrow: 1 }}>
                    <Typography variant="subtitle1">Calories remaining</Typography>
                    <Skeleton width="40%" height={SUMMARY_SKELETON_VALUE_HEIGHT} />
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Logged:
                        </Typography>
                        <Skeleton width="55%" height={20} />
                    </Box>
                    {dashboardMode && (
                        <Typography variant="body2" color="primary">
                            View / edit {isActiveDateToday ? "today's log" : 'this log'}
                        </Typography>
                    )}
                </Box>
            </Box>
        );
    } else if (isError) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                    Unable to load this log summary.
                </Typography>
                {dashboardMode && (
                    <Typography variant="body2" color="primary">
                        View / edit {isActiveDateToday ? "today's log" : 'this log'}
                    </Typography>
                )}
            </Box>
        );
    } else {
        const gaugeValueForRender = Math.max(0, Math.min(animatedGaugePercent, 1)) * gaugeMax;
        const remainingDisplayLabel = Math.round(Math.max(animatedRemainingDisplayValue, 0));

        cardBody = (
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    flexDirection: { xs: 'column', sm: 'row' }
                }}
            >
                <Gauge
                    width={GAUGE_WIDTH}
                    height={GAUGE_HEIGHT}
                    startAngle={GAUGE_START_ANGLE}
                    endAngle={GAUGE_END_ANGLE}
                    value={gaugeValueForRender}
                    valueMin={0}
                    valueMax={gaugeMax}
                    innerRadius={GAUGE_INNER_RADIUS}
                    outerRadius={GAUGE_OUTER_RADIUS}
                    text={() => ''}
                    sx={{
                        '& .MuiGauge-referenceArc': {
                            fill: (theme) => (isOver ? theme.palette.error.main : theme.palette.grey[300])
                        },
                        '& .MuiGauge-valueArc': {
                            fill: (theme) => theme.palette.primary.main
                        }
                    }}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Typography variant="subtitle1">
                        {remainingCalories !== null && remainingCalories < 0 ? 'Calories over budget' : 'Calories remaining'}
                    </Typography>
                    <Typography variant="h5">
                        {remainingCalories !== null
                            ? `${remainingDisplayLabel} Calories`
                            : '—'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Logged: {totalCalories} Calories {dailyTarget ? `of ${Math.round(dailyTarget)} Calories target` : ''}
                    </Typography>
                    {dashboardMode && (
                        <Typography variant="body2" color="primary">
                            View / edit {isActiveDateToday ? "today's log" : 'this log'}
                        </Typography>
                    )}
                </Box>
            </Box>
        );
    }

    const content = (
        <CardContent>
            <Typography variant="h6" gutterBottom>
                {title}
            </Typography>
            {cardBody}
        </CardContent>
    );

    return (
        <Card
            sx={{
                height: '100%',
                width: '100%',
                ...(dashboardMode
                    ? {
                        transition: 'transform 120ms ease',
                        '&:hover': { transform: 'translateY(-2px)' }
                    }
                    : null)
            }}
        >
            {dashboardMode ? (
                <CardActionArea component={RouterLink} to="/log" sx={{ height: '100%' }}>
                    {content}
                </CardActionArea>
            ) : (
                content
            )}
        </Card>
    );
};

export default LogSummaryCard;
