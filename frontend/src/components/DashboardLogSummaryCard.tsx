import React from 'react';
import { Box, Card, CardActionArea, CardContent, Skeleton, Typography } from '@mui/material';
import { Gauge } from '@mui/x-charts/Gauge';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { getTodayIsoDate } from '../utils/date';

type FoodLogEntry = {
    id: number;
    meal_period: string;
    name: string;
    calories: number;
};

type ProfileSummary = {
    calorieSummary?: {
        dailyCalorieTarget?: number;
    };
};

const DashboardLogSummaryCard: React.FC = () => {
    const { user } = useAuth();
    const today = getTodayIsoDate(user?.timezone);

    const foodQuery = useQuery({
        queryKey: ['food', today],
        queryFn: async (): Promise<FoodLogEntry[]> => {
            const res = await axios.get('/api/food?date=' + encodeURIComponent(today));
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const profileSummaryQuery = useQuery({
        queryKey: ['profile-summary'],
        queryFn: async (): Promise<ProfileSummary> => {
            const res = await axios.get('/api/user/profile');
            return res.data;
        }
    });

    const logs = foodQuery.data ?? [];
    const totalCalories = logs.reduce((acc, log) => acc + log.calories, 0);
    const dailyTarget = profileSummaryQuery.data?.calorieSummary?.dailyCalorieTarget;
    const remainingCalories = typeof dailyTarget === 'number' ? Math.round(dailyTarget - totalCalories) : null;
    const isOver = dailyTarget !== undefined && dailyTarget !== null && totalCalories > dailyTarget;
    const gaugeValue = dailyTarget
        ? isOver
            ? dailyTarget
            : Math.max(totalCalories, 0)
        : 0;
    const gaugeMax = dailyTarget
        ? isOver
            ? totalCalories
            : dailyTarget
        : 1;

    const isLoading = foodQuery.isLoading || profileSummaryQuery.isLoading;
    const isError = foodQuery.isError || profileSummaryQuery.isError;

    return (
        <Card
            sx={{
                transition: 'transform 120ms ease',
                '&:hover': { transform: 'translateY(-2px)' },
                height: '100%',
                width: '100%'
            }}
        >
            <CardActionArea component={RouterLink} to="/log" sx={{ height: '100%' }}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Today&apos;s Log
                    </Typography>
                    {isLoading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Skeleton variant="circular" width={140} height={140} />
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flexGrow: 1 }}>
                                <Skeleton width="60%" />
                                <Skeleton width="40%" height={32} />
                                <Skeleton width="80%" />
                            </Box>
                        </Box>
                    ) : isError ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography variant="body2" color="text.secondary">
                                Unable to load today&apos;s totals.
                            </Typography>
                            <Typography variant="body2" color="primary">
                                View / edit today&apos;s log
                            </Typography>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Gauge
                                width={200}
                                height={140}
                                startAngle={-90}
                                endAngle={90}
                                value={gaugeValue}
                                valueMin={0}
                                valueMax={gaugeMax}
                                innerRadius="70%"
                                outerRadius="90%"
                                text={() => ''}
                                sx={{
                                    '& .MuiGauge-referenceArc': {
                                        fill: (theme) =>
                                            isOver ? theme.palette.error.main : theme.palette.grey[300]
                                    },
                                    '& .MuiGauge-valueArc': {
                                        fill: (theme) => theme.palette.primary.main
                                    }
                                }}
                            />
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="subtitle1">
                                    {remainingCalories !== null && remainingCalories < 0
                                        ? 'Calories over budget'
                                        : 'Calories remaining'}
                                </Typography>
                                <Typography variant="h5">
                                    {remainingCalories !== null
                                        ? `${remainingCalories < 0 ? Math.abs(remainingCalories) : remainingCalories} Calories`
                                        : '—'}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Logged: {totalCalories} Calories{' '}
                                    {dailyTarget ? `of ${Math.round(dailyTarget)} Calories target` : ''}
                                </Typography>
                                <Typography variant="body2" color="primary">
                                    View / edit today&apos;s log
                                </Typography>
                            </Box>
                        </Box>
                    )}
                </CardContent>
            </CardActionArea>
        </Card>
    );
};

export default DashboardLogSummaryCard;
