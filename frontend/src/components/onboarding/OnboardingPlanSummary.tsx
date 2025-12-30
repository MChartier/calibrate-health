import React from 'react';
import { Box, Divider, Stack, Typography } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { activityLevelOptions } from '../../constants/activityLevels';
import { computeGoalProjection, formatDateValue, getGoalModeFromDailyDeficit, roundWeight, startOfLocalDay } from '../../utils/goalTracking';

const SUMMARY_NUMBER_FONT_WEIGHT = 900; // Makes the primary target feel like a "result", not just another form value.
const BREAKDOWN_NUMBER_MIN_WIDTH_PX = 110; // Aligns right-hand numbers for scan-friendly math.
const TARGET_DATE_LABEL_LETTER_SPACING = 0.5; // Keeps the label crisp and "badge-like" without feeling shouty.
const TARGET_DATE_SECTION_PADDING_TOP = 2; // Adds separation before the final target-date takeaway.

export type OnboardingPlanSummaryProps = {
    dailyTarget?: number;
    tdee?: number;
    bmr?: number;
    deficit?: number | null;
    activityLevel?: string | null;
    startWeight?: number | null;
    targetWeight?: number | null;
    /** "lb" or "kg" (used for the constant-rate date projection). */
    unitLabel?: string;
};

/**
 * Map an activity level enum to a short, user-friendly title.
 */
function formatActivityLevelTitle(value: string | null | undefined): string {
    if (!value) return '';
    return activityLevelOptions.find((option) => option.value === value)?.title ?? value;
}

/**
 * Convert a signed deficit value (positive=deficit, negative=surplus) into display text + a numeric delta.
 *
 * Our daily target is computed as `TDEE - deficit`, so the "goal delta" shown in the breakdown is `-deficit`.
 */
function getGoalAdjustmentInfo(deficit: number): { label: string; deltaKcal: number; caption: string } {
    if (deficit === 0) {
        return {
            label: 'Goal: Maintain',
            deltaKcal: 0,
            caption: 'No adjustment applied (maintain weight)'
        };
    }

    const abs = Math.abs(deficit);
    if (deficit > 0) {
        return {
            label: `Deficit: ${abs} kcal/day`,
            deltaKcal: -abs,
            caption: 'Deficit applied to your estimated burn to support weight loss'
        };
    }

    return {
        label: `Surplus: ${abs} kcal/day`,
        deltaKcal: abs,
        caption: 'Surplus applied to your estimated burn to support weight gain'
    };
}

/**
 * Pick a semantic color for the goal adjustment delta in the breakdown table.
 *
 * We show deficit (negative delta) as "warning/error" and surplus (positive delta) as "success".
 */
function getGoalDeltaColor(theme: Theme, goalDelta: number | undefined): string {
    if (goalDelta === undefined) return theme.palette.text.secondary;
    if (goalDelta < 0) return theme.palette.error.main;
    if (goalDelta > 0) return theme.palette.success.main;
    return theme.palette.text.secondary;
}

/**
 * Format a goal adjustment delta (kcal) as a signed label for the breakdown table.
 */
function formatGoalDeltaLabel(goalDelta: number | undefined): string {
    if (goalDelta === undefined) return '—';
    const rounded = Math.round(goalDelta);
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${rounded} kcal`;
}

/**
 * Compute a projected target date label for onboarding, when enough inputs are available.
 */
function getProjectedTargetDateLabel(opts: {
    startWeight: number | null | undefined;
    targetWeight: number | null | undefined;
    dailyDeficit: number | null | undefined;
    unitLabel: string | null | undefined;
}): { label: string } | null {
    if (typeof opts.startWeight !== 'number' || !Number.isFinite(opts.startWeight)) return null;
    if (typeof opts.targetWeight !== 'number' || !Number.isFinite(opts.targetWeight)) return null;
    if (typeof opts.dailyDeficit !== 'number' || !Number.isFinite(opts.dailyDeficit)) return null;
    if (!opts.unitLabel) return null;

    const goalMode = getGoalModeFromDailyDeficit(opts.dailyDeficit);
    if (goalMode === 'maintain') {
        return { label: formatDateValue(startOfLocalDay(new Date())) };
    }

    const projection = computeGoalProjection({
        goalMode,
        unitLabel: opts.unitLabel,
        startWeight: roundWeight(opts.startWeight),
        targetWeight: roundWeight(opts.targetWeight),
        dailyDeficit: opts.dailyDeficit,
        goalCreatedAt: null,
        currentWeight: null,
        currentWeightDate: null
    });

    return { label: projection.projectedDateLabel };
}

/**
 * Provide a short, onboarding-friendly caption for the projection assumptions.
 */
function formatProjectionCaption(dailyDeficit: number): string {
    if (dailyDeficit === 0) {
        return 'You are already at your target. We will help you stay consistent from here.';
    }

    const abs = Math.abs(dailyDeficit);
    const noun = dailyDeficit > 0 ? 'deficit' : 'surplus';
    return `Estimate assumes a steady ${abs} kcal/day ${noun}.`;
}

/**
 * OnboardingPlanSummary
 *
 * A short "result" screen that explains what we computed from onboarding:
 * - estimated burn (TDEE)
 * - the goal adjustment (deficit/surplus)
 * - the resulting daily calorie target to log against
 *
 * This avoids the experience feeling like onboarding ends abruptly and the user gets dumped into the app.
 */
const OnboardingPlanSummary: React.FC<OnboardingPlanSummaryProps> = ({
    dailyTarget,
    tdee,
    bmr,
    deficit,
    activityLevel,
    startWeight,
    targetWeight,
    unitLabel
}) => {
    const hasNumbers = typeof dailyTarget === 'number' && typeof tdee === 'number';

    const activityDelta = typeof tdee === 'number' && typeof bmr === 'number' ? Math.round((tdee - bmr) * 10) / 10 : undefined;
    const activityMultiplier =
        typeof tdee === 'number' && typeof bmr === 'number' && bmr !== 0 ? Math.round((tdee / bmr) * 1000) / 1000 : undefined;

    const goalInfo = typeof deficit === 'number' ? getGoalAdjustmentInfo(deficit) : null;
    const goalDelta = goalInfo ? goalInfo.deltaKcal : undefined;
    const goalDeltaLabel = formatGoalDeltaLabel(goalDelta);

    const primaryTargetText = hasNumbers ? `${Math.round(dailyTarget!)} kcal/day` : 'Calorie target';
    const activityLevelTitle = formatActivityLevelTitle(activityLevel);
    const projectedTargetDate = getProjectedTargetDateLabel({
        startWeight,
        targetWeight,
        dailyDeficit: deficit ?? null,
        unitLabel: unitLabel ?? null
    });
    const projectionCaption = projectedTargetDate && typeof deficit === 'number' ? formatProjectionCaption(deficit) : null;

    return (
        <Stack spacing={2}>
            <Box>
                <Typography variant="h5" gutterBottom>
                    Your plan is ready
                </Typography>
                <Typography color="text.secondary">
                    This is your estimated daily calorie budget. Log food against this target, and we&apos;ll track progress over time.
                </Typography>
            </Box>

            <Box>
                <Typography variant="h3" sx={{ fontWeight: SUMMARY_NUMBER_FONT_WEIGHT }} color="primary">
                    {primaryTargetText}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Estimated burn (TDEE): {typeof tdee === 'number' ? Math.round(tdee) : '—'} kcal/day
                    {goalInfo ? ` | ${goalInfo.label}` : ''}
                </Typography>
            </Box>

            <Divider />

            <Stack spacing={1.25}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                    How we calculated it
                </Typography>

                <Stack spacing={1} divider={<Divider />}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2">Basal Metabolic Rate (BMR)</Typography>
                            <Typography variant="caption" color="text.secondary">
                                From sex, age, height, weight (Mifflin–St Jeor)
                            </Typography>
                        </Box>
                        <Typography
                            variant="body2"
                            sx={{ color: (theme) => theme.palette.success.main, textAlign: 'right', minWidth: BREAKDOWN_NUMBER_MIN_WIDTH_PX }}
                        >
                            {typeof bmr === 'number' ? `+${Math.round(bmr)} kcal` : '—'}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2">Activity adjustment</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Level: {activityLevelTitle || '—'} | Multiplier {activityMultiplier ?? '—'}x
                            </Typography>
                        </Box>
                        <Typography
                            variant="body2"
                            sx={{ color: (theme) => theme.palette.success.main, textAlign: 'right', minWidth: BREAKDOWN_NUMBER_MIN_WIDTH_PX }}
                        >
                            {activityDelta !== undefined ? `+${Math.round(activityDelta)} kcal` : '—'}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2">Goal adjustment</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {goalInfo?.caption ?? 'Deficit (lose) or surplus (gain) applied to your TDEE'}
                            </Typography>
                        </Box>
                        <Typography
                            variant="body2"
                            sx={(theme) => ({
                                color: getGoalDeltaColor(theme, goalDelta),
                                textAlign: 'right',
                                minWidth: BREAKDOWN_NUMBER_MIN_WIDTH_PX
                            })}
                        >
                            {goalDeltaLabel}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <Typography variant="body2" fontWeight={600}>
                            Daily target
                        </Typography>
                        <Typography variant="body2" fontWeight={600} sx={{ textAlign: 'right', minWidth: BREAKDOWN_NUMBER_MIN_WIDTH_PX }}>
                            {typeof dailyTarget === 'number' ? `${Math.round(dailyTarget)} kcal` : '—'}
                        </Typography>
                    </Box>
                </Stack>

                <Typography variant="body2" color="text.secondary">
                    This is an estimate, not a perfect measurement. You can change your goal pace and profile details any time in the app.
                </Typography>
            </Stack>

            {projectedTargetDate && (
                <Box
                    sx={(theme) => {
                        return {
                            mt: 1,
                            pt: TARGET_DATE_SECTION_PADDING_TOP,
                            borderTop: `1px solid ${theme.palette.divider}`
                        };
                    }}
                >
                    <Typography
                        variant="overline"
                        color="text.secondary"
                        sx={{ fontWeight: 900, letterSpacing: TARGET_DATE_LABEL_LETTER_SPACING }}
                    >
                        Target date (estimate)
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 900, lineHeight: 1.1 }} color="secondary">
                        {projectedTargetDate.label}
                    </Typography>
                    {projectionCaption && (
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {projectionCaption}
                        </Typography>
                    )}
                </Box>
            )}
        </Stack>
    );
};

export default OnboardingPlanSummary;
