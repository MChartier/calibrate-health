import React from 'react';
import { Alert, Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

type ProfileSummary = {
    profile: {
        activity_level: string | null;
        date_of_birth: string | null;
        height_mm: number | null;
        sex: string | null;
    };
    calorieSummary: {
        dailyCalorieTarget?: number;
        tdee?: number;
        bmr?: number;
        missing: string[];
        deficit?: number | null;
    };
};

const CalorieTargetBanner: React.FC = () => {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['profile-summary'],
        queryFn: async (): Promise<ProfileSummary> => {
            const res = await axios.get('/api/user/profile');
            return res.data;
        }
    });

    if (isLoading) {
        return (
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} />
                    <Typography>Loading targets…</Typography>
                </Box>
            </Paper>
        );
    }

    if (isError || !data) {
        return (
            <Alert severity="warning" sx={{ mb: 2 }}>
                Unable to load daily target right now.
            </Alert>
        );
    }

    const { calorieSummary } = data;
    if (!calorieSummary) {
        return null;
    }

    const missing = calorieSummary.missing || [];
    const hasTarget = typeof calorieSummary.dailyCalorieTarget === 'number';

    return (
        <Paper sx={{ p: 2, mb: 2 }}>
            <Stack spacing={0.5}>
                <Typography variant="h6">Daily Target</Typography>
                {hasTarget ? (
                    <>
                        <Typography variant="h4" color="primary">
                            {Math.round(calorieSummary.dailyCalorieTarget!)} kcal/day
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            TDEE: {calorieSummary.tdee ?? '—'} kcal · Deficit: {calorieSummary.deficit ?? '—'} kcal/day
                        </Typography>
                    </>
                ) : (
                    <Alert severity="info">
                        Add birthday, sex, height, activity level, latest weight, and a goal deficit to see a daily calorie target.
                    </Alert>
                )}
                {!hasTarget && missing.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                        Missing: {missing.join(', ')}
                    </Typography>
                )}
            </Stack>
        </Paper>
    );
};

export default CalorieTargetBanner;
