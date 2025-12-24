import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { Gauge } from '@mui/x-charts/Gauge';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { formatDateToLocalDateString } from '../utils/date';
import type { MealPeriod } from '../types/mealPeriod';

type FoodLogEntry = {
    id: number;
    meal_period: MealPeriod;
    name: string;
    calories: number;
};

type ProfileSummary = {
    calorieSummary?: {
        dailyCalorieTarget?: number;
    };
};

const DashboardLogSummaryCard: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const timeZone = user?.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const today = formatDateToLocalDateString(new Date(), timeZone);

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
    const valueColor = '#4caf50';
    const trackColor = isOver ? '#f44336' : '#e0e0e0';

    return (
        <Paper
            sx={{
                p: 2,
                cursor: 'pointer',
                transition: 'transform 120ms ease',
                '&:hover': { transform: 'translateY(-2px)' },
                height: '100%',
                width: '100%'
            }}
            onClick={() => navigate('/log')}
        >
            <Typography variant="h6" gutterBottom>Today&apos;s Log</Typography>
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
                            fill: trackColor
                        },
                        '& .MuiGauge-valueArc': {
                            fill: valueColor
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
                    <Typography variant="body2" color="primary">
                        View / edit today&apos;s log
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
};

export default DashboardLogSummaryCard;
