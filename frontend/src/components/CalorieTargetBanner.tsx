import React from 'react';
import { Alert, Box, Button, CircularProgress, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useUserProfileQuery } from '../queries/userProfile';
import AppCard from '../ui/AppCard';

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

const CalorieTargetBanner: React.FC = () => {
    const { data, isLoading, isError, refetch } = useUserProfileQuery();

    if (isLoading) {
        return (
            <AppCard sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={20} />
                    <Typography>Loading targets…</Typography>
                </Box>
            </AppCard>
        );
    }

    if (isError || !data) {
        return (
            <Alert
                severity="warning"
                sx={{ mb: 2 }}
                action={
                    <Button color="inherit" size="small" onClick={() => void refetch()}>
                        Retry
                    </Button>
                }
            >
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

    const bmr = calorieSummary.bmr;
    const tdee = calorieSummary.tdee;
    const deficit = calorieSummary.deficit;
    const dailyTarget = calorieSummary.dailyCalorieTarget;

    const activityDelta =
        typeof tdee === 'number' && typeof bmr === 'number' ? Math.round((tdee - bmr) * 10) / 10 : undefined;
    const activityMultiplier =
        typeof tdee === 'number' && typeof bmr === 'number' && bmr !== 0 ? Math.round((tdee / bmr) * 1000) / 1000 : undefined;
    // Daily target is computed as `TDEE - deficit`. A surplus is represented as a negative deficit value.
    const goalDelta = typeof deficit === 'number' ? -deficit : undefined;

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
                            Deficit (negative) or surplus (positive) applied to your TDEE
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
        <AppCard sx={{ mb: 2 }}>
            <Stack spacing={0.5}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6">Daily Target</Typography>
                    <Tooltip
                        title={breakdownContent}
                        arrow
                        enterTouchDelay={0}
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
                {!hasTarget && missing.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                        Missing: {missing.join(', ')}
                    </Typography>
                )}
            </Stack>
        </AppCard>
    );
};

export default CalorieTargetBanner;
