import React from 'react';
import { Alert, Box, CircularProgress, IconButton, Paper, Stack, Tooltip, Typography, Divider } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

/**
 * CalorieTargetBanner
 *
 * Intent:
 * - Surface the daily calorie target prominently on dashboard/log.
 * - Make the math transparent: BMR (sex/age/height/weight) -> activity multiplier -> goal adjustment -> target.
 * - Use an "invoice" style breakdown: green positives (energy available), red negatives (deficit), right-aligned numbers, clear total.
 *
 * UX rationale:
 * - If data is missing, explain which inputs are needed.
 * - Tooltip uses structured lines and shows the activity multiplier explicitly to avoid "black box" perception.
 * - Colors reinforce add/remove semantics while keeping the primary target readable in neutral text.
 */

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

type Props = {
    /**
     * Show a quick summary of how the selected day compares to the daily target.
     */
    consumedCalories: number;
    /**
     * Label for the day being summarized (e.g., "Today" or a formatted date string).
     */
    selectedDateLabel: string;
};

const CalorieTargetBanner: React.FC<Props> = ({ consumedCalories, selectedDateLabel }) => {
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
    const hasConsumedCalories = Number.isFinite(consumedCalories);

    const bmr = calorieSummary.bmr;
    const tdee = calorieSummary.tdee;
    const deficit = calorieSummary.deficit;
    const dailyTarget = calorieSummary.dailyCalorieTarget;

    const remainingCalories =
        typeof dailyTarget === 'number' && hasConsumedCalories ? Math.round(dailyTarget - consumedCalories) : null;
    const isOverTarget = remainingCalories !== null && remainingCalories < 0;

    const activityDelta =
        typeof tdee === 'number' && typeof bmr === 'number' ? Math.round((tdee - bmr) * 10) / 10 : undefined;
    const activityMultiplier =
        typeof tdee === 'number' && typeof bmr === 'number' && bmr !== 0 ? Math.round((tdee / bmr) * 1000) / 1000 : undefined;
    const goalDelta = typeof deficit === 'number' ? -Math.abs(deficit) : undefined;

    const breakdownContent = hasTarget ? (
        <Box sx={{ maxWidth: 320 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                How we calculate your daily target
            </Typography>
            <Stack spacing={1} divider={<Divider />}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Box>
                        <Typography variant="body2">Basal Metabolic Rate (BMR)</Typography>
                        <Typography variant="caption" color="text.secondary">
                            From sex, age, height, weight (Mifflin–St Jeor)
                        </Typography>
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{ color: (theme) => theme.palette.success.main, textAlign: 'right', minWidth: 96 }}
                    >
                        {typeof bmr === 'number' ? `+${bmr} Calories` : '—'}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Box>
                        <Typography variant="body2">Activity adjustment</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Daily movement/exercise level ({data.profile.activity_level ?? '—'}) · Multiplier {activityMultiplier ?? '—'}x
                        </Typography>
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{ color: (theme) => theme.palette.success.main, textAlign: 'right', minWidth: 96 }}
                    >
                        {activityDelta !== undefined ? `+${activityDelta} Calories` : '+ —'}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Box>
                        <Typography variant="body2">Goal adjustment</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Deficit (negative) or surplus (positive)
                        </Typography>
                    </Box>
                    <Typography
                        variant="body2"
                        sx={{
                            color: (theme) => (goalDelta !== undefined && goalDelta < 0 ? theme.palette.error.main : theme.palette.success.main),
                            textAlign: 'right',
                            minWidth: 96
                        }}
                    >
                        {goalDelta !== undefined
                            ? `${goalDelta > 0 ? '+' : ''}${goalDelta} Calories`
                            : '—'}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600}>
                        Daily target
                    </Typography>
                    <Typography variant="body2" fontWeight={600} color="text.primary" sx={{ textAlign: 'right', minWidth: 96 }}>
                        {dailyTarget !== undefined ? `${Math.round(dailyTarget)} Calories` : '—'}
                    </Typography>
                </Box>
            </Stack>
        </Box>
    ) : (
        <Box sx={{ maxWidth: 320 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Missing info
            </Typography>
            <Typography variant="body2">
                Provide birthday, sex, height, activity level, latest weight, and a goal deficit/surplus to compute a target.
            </Typography>
        </Box>
    );

    return (
        <Paper sx={{ p: 2, mb: 2 }}>
            <Stack spacing={0.5}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6">Daily Target</Typography>
                    <Tooltip
                        title={breakdownContent}
                        arrow
                        enterTouchDelay={0}
                        slotProps={{
                            tooltip: {
                                sx: {
                                    bgcolor: 'background.paper',
                                    color: 'text.primary',
                                    boxShadow: (theme) => theme.shadows[4],
                                    border: (theme) => `1px solid ${theme.palette.divider}`
                                }
                            },
                            arrow: {
                                sx: { color: 'background.paper' }
                            }
                        }}
                    >
                        <IconButton size="small" aria-label="How is this calculated?">
                            <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
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
                {hasTarget && hasConsumedCalories && (
                    <Box
                        sx={{
                            mt: 1,
                            p: 1.5,
                            borderRadius: 1,
                            bgcolor: (theme) =>
                                isOverTarget
                                    ? theme.palette.error.light + '22'
                                    : theme.palette.success.light + '22'
                        }}
                    >
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                            {selectedDateLabel ? `${selectedDateLabel} summary` : 'Daily summary'}
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.5} alignItems="baseline">
                            <Typography variant="h5">{Math.round(consumedCalories)} kcal consumed</Typography>
                            <Typography
                                variant="body1"
                                color={isOverTarget ? 'error.main' : 'success.main'}
                                sx={{ fontWeight: 600 }}
                            >
                                {remainingCalories !== null
                                    ? isOverTarget
                                        ? `${Math.abs(remainingCalories)} kcal over target`
                                        : `${remainingCalories} kcal remaining`
                                    : '—'}
                            </Typography>
                        </Stack>
                    </Box>
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
