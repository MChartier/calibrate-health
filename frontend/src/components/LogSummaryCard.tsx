import React from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { Gauge } from '@mui/x-charts/Gauge';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

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

export type LogSummaryCardProps = {
    /**
     * When true, the card behaves like the dashboard version: it is clickable (navigates to `/log`)
     * and includes a call-to-action line.
     */
    dashboardMode?: boolean;
    /**
     * Local date string (`YYYY-MM-DD`) used to fetch and display the log summary.
     * Defaults to the user's local "today".
     */
    date?: string;
};

function getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const LogSummaryCard: React.FC<LogSummaryCardProps> = ({ dashboardMode = false, date }) => {
    const navigate = useNavigate();
    const today = getLocalDateString(new Date());
    const activeDate = date ?? today;
    const isActiveDateToday = activeDate === today;
    const title = isActiveDateToday ? "Today's Log" : `Log for ${activeDate}`;

    const foodQuery = useQuery({
        queryKey: ['food', activeDate],
        queryFn: async (): Promise<FoodLogEntry[]> => {
            const res = await axios.get('/api/food?date=' + encodeURIComponent(`${activeDate}T12:00:00`));
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
                height: '100%',
                width: '100%',
                ...(dashboardMode
                    ? {
                        cursor: 'pointer',
                        transition: 'transform 120ms ease',
                        '&:hover': { transform: 'translateY(-2px)' }
                    }
                    : { cursor: 'default' })
            }}
            onClick={dashboardMode ? () => navigate('/log') : undefined}
        >
            <Typography variant="h6" gutterBottom>{title}</Typography>
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
                    {dashboardMode ? (
                        <Typography variant="body2" color="primary">
                            View / edit {isActiveDateToday ? "today's log" : 'this log'}
                        </Typography>
                    ) : null}
                </Box>
            </Box>
        </Paper>
    );
};

export default LogSummaryCard;
