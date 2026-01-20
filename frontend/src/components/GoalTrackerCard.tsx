import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Dialog, DialogContent, DialogTitle, Skeleton, Typography } from '@mui/material';
import { alpha, type Theme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import GoalEditor from './GoalEditor';
import SectionHeader from '../ui/SectionHeader';
import type { GoalMode } from '../utils/goalValidation';
import { useI18n } from '../i18n/useI18n';
import type { TranslationKey } from '../i18n/resources';
import {
    computeGoalProgress,
    computeGoalProjection,
    getGoalModeFromDailyDeficit,
    getMaintenanceTolerance
} from '../utils/goalTracking';

/**
 * Goal tracker card UI shared by the dashboard and goals page.
 *
 * Encapsulates progress visualization and goal projection messaging.
 */
const EM_DASH = '\u2014';

type ModeAlpha = { light: number; dark: number };

const PROGRESS_TRACK_ALPHA: ModeAlpha = { dark: 0.14, light: 0.08 };
const MAINTENANCE_TOLERANCE_ALPHA: ModeAlpha = { dark: 0.28, light: 0.18 };

// Shared progress-bar sizing so markers stay vertically centered on the track.
const PROGRESS_BAR_HEIGHT_PX = 10;
const PROGRESS_MARKER_SIZE_PX = 14;
const PROGRESS_MARKER_TOP_PX = (PROGRESS_BAR_HEIGHT_PX - PROGRESS_MARKER_SIZE_PX) / 2;

/**
 * Resolve a mode-specific alpha value so translucent surfaces stay consistent in light/dark mode.
 */
function resolveModeAlpha(theme: Theme, alphaByMode: ModeAlpha): number {
    return theme.palette.mode === 'dark' ? alphaByMode.dark : alphaByMode.light;
}

type GoalResponse = {
    start_weight: number;
    target_weight: number;
    target_date: string | null;
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
    const { t } = useI18n();
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

        const currentWeightLabel =
            typeof currentWeight === 'number' && Number.isFinite(currentWeight) ? `${currentWeight.toFixed(1)} ${unitLabel}` : EM_DASH;

        const statusLabel = (() => {
            if (delta === null) return t('goalTracker.status.logWeighIn');
            if (absDelta === null) return t('goalTracker.status.logWeighIn');
            if (isOnTarget) return t('goalTracker.status.onTarget');
            const direction = delta > 0 ? t('goalTracker.status.above') : t('goalTracker.status.below');
            return `${absDelta.toFixed(1)} ${unitLabel} ${direction}`;
        })();

        return (
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5, gap: 1 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {t('goalTracker.label.target', { value: targetWeight.toFixed(1), unit: unitLabel })}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {t('goalTracker.label.tolerance', { value: tolerance.toFixed(1), unit: unitLabel })}
                    </Typography>
                </Box>

                <Box sx={{ position: 'relative' }}>
                    <Box
                        sx={{
                            height: PROGRESS_BAR_HEIGHT_PX,
                            borderRadius: 999,
                            backgroundColor: (theme) =>
                                alpha(theme.palette.text.primary, resolveModeAlpha(theme, PROGRESS_TRACK_ALPHA)),
                            overflow: 'hidden'
                        }}
                    />

                    <Box
                        sx={{
                            position: 'absolute',
                            top: 0,
                            height: PROGRESS_BAR_HEIGHT_PX,
                            left: `${toleranceLeftPercent}%`,
                            width: `${toleranceWidthPercent}%`,
                            borderRadius: 999,
                            backgroundColor: (theme) =>
                                alpha(theme.palette.secondary.main, resolveModeAlpha(theme, MAINTENANCE_TOLERANCE_ALPHA))
                        }}
                        aria-label={t('goalTracker.aria.onTargetRange')}
                    />

                    <Box
                        sx={{
                            position: 'absolute',
                            left: '50%',
                            top: PROGRESS_MARKER_TOP_PX,
                            width: 2,
                            height: PROGRESS_MARKER_SIZE_PX,
                            backgroundColor: 'divider',
                            transform: 'translateX(-50%)'
                        }}
                        aria-label={t('goalTracker.aria.targetMarker')}
                    />

                    {delta !== null && (
                        <Box
                            sx={{
                                position: 'absolute',
                                left: `${markerPercent}%`,
                                top: PROGRESS_MARKER_TOP_PX,
                                transform: 'translateX(-50%)'
                            }}
                        >
                            <Box
                                sx={{
                                    width: PROGRESS_MARKER_SIZE_PX,
                                    height: PROGRESS_MARKER_SIZE_PX,
                                    borderRadius: '50%',
                                    backgroundColor: 'background.paper',
                                    border: (theme) => `2px solid ${theme.palette.primary.main}`
                                }}
                                aria-label={t('goalTracker.aria.currentWeightMarker')}
                            />
                        </Box>
                    )}
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 1, gap: 1 }}>
                    <Typography variant="body2">{t('goalTracker.label.current', { weight: currentWeightLabel })}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {statusLabel}
                    </Typography>
                </Box>
            </Box>
        );
    }

    const progress =
        typeof currentWeight === 'number' && Number.isFinite(currentWeight)
            ? computeGoalProgress({ startWeight, targetWeight, currentWeight })
            : null;

    const projectedLabel =
        projection.projectedDateLabel === EM_DASH
            ? t('goalTracker.label.projectedMissing')
            : t('goalTracker.label.projected', { date: projection.projectedDateLabel });
    const currentWeightLabel =
        typeof currentWeight === 'number' && Number.isFinite(currentWeight) ? `${currentWeight.toFixed(1)} ${unitLabel}` : EM_DASH;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5, gap: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {t('goalTracker.label.start', { value: startWeight.toFixed(1), unit: unitLabel })}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    {t('goalTracker.label.goal', { value: targetWeight.toFixed(1), unit: unitLabel })}
                </Typography>
            </Box>

            <Box sx={{ position: 'relative' }}>
                {progress && (
                    <Box
                        sx={{
                            position: 'absolute',
                            left: `${progress.percent}%`,
                            top: PROGRESS_MARKER_TOP_PX,
                            transform: 'translateX(-50%)'
                        }}
                    >
                        <Box
                            sx={{
                                width: PROGRESS_MARKER_SIZE_PX,
                                height: PROGRESS_MARKER_SIZE_PX,
                                borderRadius: '50%',
                                backgroundColor: 'background.paper',
                                border: (theme) => `2px solid ${theme.palette.primary.main}`
                            }}
                            aria-label={t('goalTracker.aria.currentProgressMarker')}
                        />
                    </Box>
                )}

                <Box
                    sx={{
                        height: PROGRESS_BAR_HEIGHT_PX,
                        borderRadius: 999,
                        backgroundColor: (theme) =>
                            alpha(theme.palette.text.primary, resolveModeAlpha(theme, PROGRESS_TRACK_ALPHA)),
                        overflow: 'hidden'
                    }}
                >
                    {progress && (
                        <Box
                            sx={{
                                height: '100%',
                                width: `${progress.percent}%`,
                                backgroundColor: 'primary.main'
                            }}
                        />
                    )}
                </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 1, gap: 1 }}>
                <Typography variant="body2">{t('goalTracker.label.current', { weight: currentWeightLabel })}</Typography>
                {progress ? (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontWeight: 600 }}
                        aria-label={t('goalTracker.aria.progressPercent')}
                    >
                        {progress.percent.toFixed(0)}%
                    </Typography>
                ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                        {t('goalTracker.status.logWeighIn')}
                    </Typography>
                )}
            </Box>

            <Typography
                variant="subtitle2"
                sx={{ fontWeight: 800, mt: 1 }}
                title={projection.detail ?? undefined}
            >
                {projectedLabel}
            </Typography>
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
    const { t } = useI18n();
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
    const [goalEditorDialog, setGoalEditorDialog] = useState<
        | {
            titleKey: TranslationKey;
            submitLabelKey: TranslationKey;
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

    const goalEditorCtaLabel = goal ? t('goalTracker.cta.setNewGoal') : t('goalTracker.cta.setGoal');

    const handleOpenGoalEditor = () => {
        const initialStartWeight = typeof currentWeight === 'number' && Number.isFinite(currentWeight) ? currentWeight : goal?.start_weight ?? null;
        const initialTargetWeight = goal?.target_weight ?? null;
        const initialDailyDeficit = goal?.daily_deficit ?? 500;

        setGoalEditorDialog({
            titleKey: goal ? 'goalTracker.dialog.title.newGoal' : 'goalTracker.dialog.title.firstGoal',
            submitLabelKey: goal ? 'goalTracker.dialog.submit.newGoal' : 'goalTracker.dialog.submit.saveGoal',
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
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                    <Skeleton width="35%" />
                    <Skeleton width="35%" />
                </Box>
                <Skeleton variant="rounded" height={PROGRESS_BAR_HEIGHT_PX} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
                    <Skeleton width="45%" />
                    <Skeleton width="15%" />
                </Box>
                <Skeleton width="55%" />
            </Box>
        );
    } else if (isError) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                    {t('goalTracker.error.unableToLoad')}
                </Typography>
                {isDashboard && (
                    <Typography variant="body2" color="primary">
                        {t('goalTracker.cta.viewGoalsDetails')}
                    </Typography>
                )}
            </Box>
        );
    } else if (!goal || !goalMode) {
        cardBody = (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography variant="body2" color="text.secondary">
                    {t('goalTracker.empty.noGoal')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('goalTracker.empty.setTargetHint')}
                </Typography>
                {isDashboard && (
                    <Typography variant="body2" color="primary">
                        {t('goalTracker.cta.setGoal')}
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
                            ? t('goalTracker.success.maintain', { target: goal.target_weight.toFixed(1), unit: unitLabel })
                            : t('goalTracker.success.other', { target: goal.target_weight.toFixed(1), unit: unitLabel })}
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
                        {t('goalTracker.cta.viewGoalsDetails')}
                    </Typography>
                )}
            </Box>
        );
    }

    const content = (
        <CardContent>
            <SectionHeader
                title={t('goalTracker.title')}
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
                <DialogTitle>
                    {goalEditorDialog ? t(goalEditorDialog.titleKey) : t('goalTracker.dialog.title.editGoalFallback')}
                </DialogTitle>
                <DialogContent dividers>
                    {goalEditorDialog && (
                        <GoalEditor
                            weightUnitLabel={unitLabel}
                            initialStartWeight={goalEditorDialog.initialStartWeight}
                            initialTargetWeight={goalEditorDialog.initialTargetWeight}
                            initialDailyDeficit={goalEditorDialog.initialDailyDeficit}
                            submitLabel={t(goalEditorDialog.submitLabelKey)}
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
