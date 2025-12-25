import React from 'react';
import { Box, Card, CardActionArea, CardContent, Skeleton, Typography } from '@mui/material';
import { Gauge } from '@mui/x-charts/Gauge';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { formatDateToLocalDateString } from '../utils/date';
import { useUserProfileQuery } from '../queries/userProfile';
import type { MealPeriod } from '../types/mealPeriod';

type FoodLogEntry = {
    id: number;
    meal_period: MealPeriod;
    name: string;
    calories: number;
};

const GAUGE_WIDTH = 200;
const GAUGE_HEIGHT = 140;
const GAUGE_START_ANGLE = -90;
const GAUGE_END_ANGLE = 90;
const GAUGE_INNER_RADIUS = '70%';
const GAUGE_OUTER_RADIUS = '90%';
const SUMMARY_SKELETON_SIZE = 140;
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

    const foodQuery = useQuery({
        queryKey: ['food', activeDate],
        queryFn: async (): Promise<FoodLogEntry[]> => {
            const res = await axios.get('/api/food?date=' + encodeURIComponent(activeDate));
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const profileSummaryQuery = useUserProfileQuery();

    const logs = foodQuery.data ?? [];
    const totalCalories = logs.reduce((acc, log) => acc + log.calories, 0);
    const dailyTarget = profileSummaryQuery.data?.calorieSummary?.dailyCalorieTarget;
    const remainingCalories = typeof dailyTarget === 'number' ? Math.round(dailyTarget - totalCalories) : null;
    const isOver = dailyTarget !== undefined && dailyTarget !== null && totalCalories > dailyTarget;
    const gaugeValue = dailyTarget ? (isOver ? dailyTarget : Math.max(totalCalories, 0)) : 0;
    const gaugeMax = dailyTarget ? (isOver ? totalCalories : dailyTarget) : 1;

    const isLoading = foodQuery.isLoading || profileSummaryQuery.isLoading;
    const isError = foodQuery.isError || profileSummaryQuery.isError;

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
                <Skeleton variant="circular" width={SUMMARY_SKELETON_SIZE} height={SUMMARY_SKELETON_SIZE} />
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1 }}>
                    <Skeleton width="60%" />
                    <Skeleton width="40%" height={SUMMARY_SKELETON_VALUE_HEIGHT} />
                    <Skeleton width="80%" />
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
                    value={gaugeValue}
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
                            ? `${remainingCalories < 0 ? Math.abs(remainingCalories) : remainingCalories} Calories`
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
