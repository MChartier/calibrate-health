import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Dialog, DialogContent, DialogTitle, Skeleton, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import GoalEditor from './GoalEditor';
import SectionHeader from '../ui/SectionHeader';
import type { GoalMode } from '../utils/goalValidation';
import {
    computeGoalProgress,
    computeGoalProjection,
    formatDateLabel,
    getGoalModeFromDailyDeficit,
    getMaintenanceTolerance
} from '../utils/goalTracking';

const EM_DASH = '\u2014';

type GoalResponse = {
    start_weight: number;
    target_weight: number;
    daily_deficit: number;
    created_at: string | null;
};

type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

export type GoalTrackerCardProps = {
    /**
     * When true, the card behaves like the Dashboard version: it is clickable (navigates to `/goals`)
     * and includes a call-to-action line.
     */
    isDashboard?: boolean;
};

/**
 * GoalTrackerBody
 *
 * Shows start/target/current weights and a progress visualization toward the goal.
 * For maintenance goals, the visualization represents proximity to the target (above/below).
 */
const GoalTrackerBody: React.FC<{
    startWeight: number;
    targetWeight: number;
    currentWeight: number | null;
    unitLabel: string;
    goalMode: GoalMode;
    goalCreatedAt: string | null;
    dailyDeficit: number;
    currentWeightDate: string | null;
}> = ({ startWeight, targetWeight, currentWeight, unitLabel, goalMode, goalCreatedAt, dailyDeficit, currentWeightDate }) => {
    const startDateLabel = formatDateLabel(goalCreatedAt);
    const projection = computeGoalProjection({
        goalMode,
        unitLabel,
        startWeight,
        targetWeight,
        dailyDeficit,
        goalCreatedAt,
        currentWeight,
        currentWeightDate
    });

    if (goalMode === 'maintain') {
        const tolerance = getMaintenanceTolerance(unitLabel);
        const delta =
            typeof currentWeight === 'number' && Number.isFinite(currentWeight) ? currentWeight - targetWeight : null;
        const absDelta = delta !== null ? Math.abs(delta) : null;
        const isOnTarget = absDelta !== null ? absDelta <= tolerance : false;
        const range = absDelta !== null ? Math.max(tolerance * 4, absDelta * 2, 0.1) : tolerance * 4;

        const clampedDelta = delta !== null ? Math.max(-range, Math.min(range, delta)) : 0;
        const markerPercent = ((clampedDelta + range) / (2 * range)) * 100;
        const toleranceWidthPercent = (tolerance / range) * 100;
        const toleranceLeftPercent = 50 - toleranceWidthPercent / 2;

        const proximityLabel = (() => {
            if (delta === null) return null;
            if (absDelta === null) return null;

            const deltaLabel =
                absDelta < 0.05
                    ? `0.0 ${unitLabel} from target`
                    : `${absDelta.toFixed(1)} ${unitLabel} ${delta > 0 ? 'above' : 'below'} target`;

            return isOnTarget ? `${deltaLabel} (on target)` : deltaLabel;
        })();

        return (
            <Box>
                <Stack spacing={0.5} sx={{ mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        Started: {startDateLabel}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Projected target date: {projection.projectedDateLabel}
                    </Typography>
                    {projection.detail && (
                        <Typography variant="caption" color="text.secondary">
                            {projection.detail}
                        </Typography>
                    )}
                </Stack>

                <Typography variant="body2" color="text.secondary">
                    Start: {startWeight.toFixed(1)} {unitLabel} · Target: {targetWeight.toFixed(1)} {unitLabel}
                </Typography>
                <Typography variant="body1" sx={{ mt: 0.5 }}>
                    Current: {typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} ${unitLabel}` : EM_DASH}
                </Typography>

                {proximityLabel ? (
                    <>
                        <Typography variant="h6" sx={{ mt: 1.25 }}>
                            {proximityLabel}
                        </Typography>

                        <Box sx={{ mt: 1.25 }}>
                            <Box sx={{ position: 'relative' }}>
                                <Box
                                    sx={{
                                        height: 10,
                                        borderRadius: 999,
                                        backgroundColor: (theme) =>
                                            alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.08),
                                        overflow: 'hidden'
                                    }}
                                />

                                <Box
                                    sx={{
                                        position: 'absolute',
                                        top: 0,
                                        height: 10,
                                        left: `${toleranceLeftPercent}%`,
                                        width: `${toleranceWidthPercent}%`,
                                        borderRadius: 999,
                                        backgroundColor: (theme) =>
                                            alpha(theme.palette.secondary.main, theme.palette.mode === 'dark' ? 0.28 : 0.18)
                                    }}
                                    aria-label="On-target range"
                                />

                                <Box
                                    sx={{
                                        position: 'absolute',
                                        left: '50%',
                                        top: -2,
                                        width: 2,
                                        height: 14,
                                        backgroundColor: 'divider',
                                        transform: 'translateX(-50%)'
                                    }}
                                    aria-label="Target marker"
                                />

                                <Box
                                    sx={{
                                        position: 'absolute',
                                        left: `${markerPercent}%`,
                                        top: -6,
                                        transform: 'translateX(-50%)'
                                    }}
                                >
                                    <Box
                                        sx={{
                                            width: 14,
                                            height: 14,
                                            borderRadius: '50%',
                                            backgroundColor: 'background.paper',
                                            border: (theme) => `2px solid ${theme.palette.primary.main}`
                                        }}
                                        aria-label="Current weight marker"
                                    />
                                </Box>
                            </Box>

                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                                Aim to stay within ±{tolerance.toFixed(1)} {unitLabel} of your target.
                            </Typography>
                        </Box>
                    </>
                ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Log a weight entry to see how close you are to your target.
                    </Typography>
                )}
            </Box>
        );
    }

    const progress =
        typeof currentWeight === 'number' && Number.isFinite(currentWeight)
            ? computeGoalProgress({ startWeight, targetWeight, currentWeight })
            : null;

    return (
        <Box>
            <Stack spacing={0.5} sx={{ mb: 1 }}>
                <Typography variant="body2" color="text.secondary">
                    Started: {startDateLabel}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Projected target date: {projection.projectedDateLabel}
                </Typography>
                {projection.detail && (
                    <Typography variant="caption" color="text.secondary">
                        {projection.detail}
                    </Typography>
                )}
            </Stack>

            <Typography variant="body2" color="text.secondary">
                Start: {startWeight.toFixed(1)} {unitLabel} · Target: {targetWeight.toFixed(1)} {unitLabel}
            </Typography>

            <Typography variant="body1" sx={{ mt: 0.5 }}>
                Current: {typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} ${unitLabel}` : EM_DASH}
            </Typography>

            {progress ? (
                <Box sx={{ mt: 1.5 }}>
                    <Box sx={{ position: 'relative' }}>
                        <Box
                            sx={{
                                position: 'absolute',
                                left: `${progress.percent}%`,
                                top: -6,
                                transform: 'translateX(-50%)'
                            }}
                        >
                            <Box
                                sx={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: '50%',
                                    backgroundColor: 'background.paper',
                                    border: (theme) => `2px solid ${theme.palette.primary.main}`
                                }}
                                aria-label="Current progress marker"
                            />
                        </Box>
                        <Box
                            sx={{
                                height: 10,
                                borderRadius: 999,
                                backgroundColor: (theme) =>
                                    alpha(theme.palette.text.primary, theme.palette.mode === 'dark' ? 0.14 : 0.08),
                                overflow: 'hidden'
                            }}
                        >
                            <Box
                                sx={{
                                    height: '100%',
                                    width: `${progress.percent}%`,
                                    backgroundColor: 'primary.main'
                                }}
                            />
                        </Box>
                    </Box>

                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                        {progress.percent.toFixed(0)}% toward goal
                    </Typography>
                </Box>
            ) : (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Log a weight entry to see progress toward this goal.
                </Typography>
            )}
        </Box>
    );
};

/**
 * GoalTrackerCard
 *
 * Shared card used on the Dashboard and on `/goals` to visualize goal progress consistently.
 * Use `isDashboard` to control whether it links to the Goals page and shows link text.
 */
const GoalTrackerCard: React.FC<GoalTrackerCardProps> = ({ isDashboard = false }) => {
    const { user } = useAuth();
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
    const [goalEditorDialog, setGoalEditorDialog] = useState<
        | {
            title: string;
            submitLabel: string;
            initialStartWeight: number | null;
            initialTargetWeight: number | null;
            initialDailyDeficit: number | null;
        }
        | null
    >(null);

    const goalQuery = useQuery({
        queryKey: ['goal'],
        queryFn: async (): Promise<GoalResponse | null> => {
            const res = await axios.get('/api/goals');
            return res.data ?? null;
        }
    });

    const metricsQuery = useQuery({
        queryKey: ['metrics'],
        queryFn: async (): Promise<MetricEntry[]> => {
            const res = await axios.get('/api/metrics');
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const goal = goalQuery.data;
    const metrics = metricsQuery.data ?? [];
    const currentWeight = metrics.length > 0 ? metrics[0].weight : null;
    const currentWeightDate = metrics.length > 0 ? metrics[0].date : null;
    const goalMode = goal ? getGoalModeFromDailyDeficit(goal.daily_deficit) : null;

    const completion = useMemo(() => {
        if (!goal || !goalMode) return false;
        if (typeof currentWeight !== 'number' || !Number.isFinite(currentWeight)) return false;

        if (goalMode === 'maintain') {
            const tolerance = getMaintenanceTolerance(unitLabel);
            return Math.abs(currentWeight - goal.target_weight) <= tolerance;
        }

        return computeGoalProgress({
            startWeight: goal.start_weight,
            targetWeight: goal.target_weight,
            currentWeight
        }).isComplete;
    }, [currentWeight, goal, goalMode, unitLabel]);

    const isLoading = goalQuery.isLoading || metricsQuery.isLoading;
    const isError = goalQuery.isError || metricsQuery.isError;

    const goalEditorCtaLabel = goal ? 'Set a new goal' : 'Set a goal';

    const handleOpenGoalEditor = () => {
        const initialStartWeight = typeof currentWeight === 'number' && Number.isFinite(currentWeight) ? currentWeight : goal?.start_weight ?? null;
        const initialTargetWeight = goal?.target_weight ?? null;
        const initialDailyDeficit = goal?.daily_deficit ?? 500;

        setGoalEditorDialog({
            title: goal ? 'Set a new goal' : 'Set your first goal',
            submitLabel: goal ? 'Save new goal' : 'Save goal',
            initialStartWeight,
            initialTargetWeight,
            initialDailyDeficit
        });
    };

    // Split conditional branches into named nodes to keep the render tree readable.
    let cardBody: React.ReactNode;
    if (isLoading) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Skeleton width="55%" />
                <Skeleton width="75%" />
                <Skeleton width="65%" />
                <Skeleton variant="rounded" height={10} />
                <Skeleton width="40%" />
            </Box>
        );
    } else if (isError) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                    Unable to load goal progress.
                </Typography>
                {isDashboard && (
                    <Typography variant="body2" color="primary">
                        View goals and details
                    </Typography>
                )}
            </Box>
        );
    } else if (!goal || !goalMode) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                    No goal set yet.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Set a target weight to start tracking progress.
                </Typography>
                {isDashboard && (
                    <Typography variant="body2" color="primary">
                        Set a goal
                    </Typography>
                )}
            </Box>
        );
    } else {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {completion && (
                    <Alert severity="success">
                        {goalMode === 'maintain'
                            ? `Nice work! You're on target for ${goal.target_weight.toFixed(1)} ${unitLabel}.`
                            : `Congratulations! You've met or exceeded your goal of ${goal.target_weight.toFixed(1)} ${unitLabel}.`}
                    </Alert>
                )}

                <GoalTrackerBody
                    startWeight={goal.start_weight}
                    targetWeight={goal.target_weight}
                    currentWeight={typeof currentWeight === 'number' ? currentWeight : null}
                    unitLabel={unitLabel}
                    goalMode={goalMode}
                    goalCreatedAt={goal.created_at ?? null}
                    dailyDeficit={goal.daily_deficit}
                    currentWeightDate={currentWeightDate}
                />

                {isDashboard && (
                    <Typography variant="body2" color="primary">
                        View goals and details
                    </Typography>
                )}
            </Box>
        );
    }

    const content = (
        <CardContent>
            <SectionHeader
                title="Goal tracker"
                actions={
                    !isDashboard ? (
                        <Button variant="outlined" size="small" onClick={handleOpenGoalEditor} disabled={isLoading}>
                            {goalEditorCtaLabel}
                        </Button>
                    ) : null
                }
                sx={{ mb: 1.5 }}
            />
            {cardBody}
        </CardContent>
    );

    return (
        <>
            <Card
                sx={{
                    height: '100%',
                    width: '100%',
                    ...(isDashboard
                        ? {
                            transition: 'transform 120ms ease',
                            '&:hover': { transform: 'translateY(-2px)' }
                        }
                        : null)
                }}
            >
                {isDashboard ? (
                    <CardActionArea component={RouterLink} to="/goals" sx={{ height: '100%' }}>
                        {content}
                    </CardActionArea>
                ) : (
                    content
                )}
            </Card>

            <Dialog
                open={goalEditorDialog !== null}
                onClose={() => setGoalEditorDialog(null)}
                fullWidth
                maxWidth="sm"
            >
                <DialogTitle>{goalEditorDialog?.title ?? 'Edit goal'}</DialogTitle>
                <DialogContent dividers>
                    {goalEditorDialog && (
                        <GoalEditor
                            weightUnitLabel={unitLabel}
                            initialStartWeight={goalEditorDialog.initialStartWeight}
                            initialTargetWeight={goalEditorDialog.initialTargetWeight}
                            initialDailyDeficit={goalEditorDialog.initialDailyDeficit}
                            submitLabel={goalEditorDialog.submitLabel}
                            onSaved={() => setGoalEditorDialog(null)}
                            onCancel={() => setGoalEditorDialog(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
};

export default GoalTrackerCard;
