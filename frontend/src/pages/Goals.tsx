import React, { useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Divider,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LineChart } from '@mui/x-charts/LineChart';
import { ChartsReferenceLine } from '@mui/x-charts/ChartsReferenceLine';
import { useAuth } from '../context/useAuth';
import { validateGoalWeights, type GoalMode } from '../utils/goalValidation';
import { DAILY_DEFICIT_CHOICE_STRINGS, normalizeDailyDeficitChoiceAbsValue } from '../../../shared/goalDeficit';

type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

type GoalResponse = {
    id: number;
    user_id: number;
    start_weight: number;
    target_weight: number;
    target_date: string | null;
    daily_deficit: number;
    created_at: string;
};

type WeightPoint = { date: Date; weight: number };

/**
 * Parse a Postgres DATE-ish string into a local Date at midnight.
 *
 * The backend stores weights as date-only values; converting to a local Date
 * avoids the chart rendering the point on the previous/next day due to timezone offsets.
 */
function parseDateOnlyToLocalDate(value: string): Date | null {
    const datePart = value.split('T')[0] ?? '';
    const [yearString, monthString, dayString] = datePart.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    return new Date(year, month - 1, day);
}

/**
 * Format a date-like string for display, falling back to an em dash for invalid inputs.
 */
function formatDateLabel(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed);
}

/**
 * Format a Date instance for display, falling back to an em dash for null/invalid dates.
 */
function formatDateValue(value: Date | null | undefined): string {
    if (!value) return '—';
    if (Number.isNaN(value.getTime())) return '—';
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(value);
}

/**
 * Parse an ISO-like timestamp into a Date, returning null for invalid input.
 */
function parseDateTime(value: string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Convert a Date into local "start of day" to keep date math stable for UI display.
 */
function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Add a number of days to a date without mutating the input.
 */
function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

/**
 * Format the user's goal calorie change with an explicit sign:
 * - deficit => "-500 kcal/day"
 * - surplus => "+500 kcal/day"
 * - maintenance => "0 kcal/day"
 */
function formatDailyCalorieChange(dailyDeficit: number): string {
    if (dailyDeficit === 0) return '0 kcal/day';
    const sign = dailyDeficit > 0 ? '-' : '+';
    return `${sign}${Math.abs(dailyDeficit)} kcal/day`;
}

/**
 * Round a numeric weight to one decimal place (matches backend storage).
 */
function roundWeight(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * Derive the goal mode from the stored daily calorie delta.
 *
 * Backend convention:
 * - positive daily_deficit => lose weight (deficit)
 * - zero daily_deficit => maintain weight
 * - negative daily_deficit => gain weight (surplus)
 */
function getGoalModeFromDailyDeficit(dailyDeficit: number): GoalMode {
    if (dailyDeficit === 0) return 'maintain';
    return dailyDeficit > 0 ? 'lose' : 'gain';
}

/**
 * Choose a reasonable "on target" tolerance for maintenance goals.
 *
 * Rationale: daily weigh-ins fluctuate; we avoid declaring success/failure on tiny changes.
 */
function getMaintenanceTolerance(unitLabel: string): number {
    return unitLabel === 'lb' ? 1 : 0.5;
}

/**
 * Compute goal progress and completion based on start/target/current.
 *
 * We treat "met or exceeded" as (for change goals):
 * - loss goal (target < start): current <= target
 * - gain goal (target > start): current >= target
 */
function computeGoalProgress(opts: {
    startWeight: number;
    targetWeight: number;
    currentWeight: number;
}): { percent: number; isComplete: boolean } {
    const { startWeight, targetWeight, currentWeight } = opts;

    const totalDelta = targetWeight - startWeight;
    const achievedDelta = currentWeight - startWeight;

    if (totalDelta === 0) {
        const epsilon = 0.1;
        const isComplete = Math.abs(currentWeight - targetWeight) <= epsilon;
        return { percent: isComplete ? 100 : 0, isComplete };
    }

    const raw = (achievedDelta / totalDelta) * 100;
    const percent = Math.max(0, Math.min(100, raw));
    const isComplete = totalDelta > 0 ? currentWeight >= targetWeight : currentWeight <= targetWeight;

    return { percent, isComplete };
}

type GoalProjection = {
    projectedDate: Date | null;
    projectedDateLabel: string;
    detail: string | null;
};

/**
 * Project a target date using the constant-rate model (3500 kcal/lb or 7700 kcal/kg).
 *
 * For non-maintenance goals, we estimate time-to-goal from the best-known baseline:
 * - latest weigh-in (preferred)
 * - otherwise, the goal's start weight on the goal's created date
 */
function computeGoalProjection(opts: {
    goalMode: GoalMode;
    unitLabel: string;
    startWeight: number;
    targetWeight: number;
    dailyDeficit: number;
    goalCreatedAt: string | null;
    currentWeight: number | null;
    currentWeightDate: string | null;
}): GoalProjection {
    const {
        goalMode,
        unitLabel,
        startWeight,
        targetWeight,
        dailyDeficit,
        goalCreatedAt,
        currentWeight,
        currentWeightDate
    } = opts;

    if (goalMode === 'maintain' || dailyDeficit === 0) {
        return {
            projectedDate: null,
            projectedDateLabel: '—',
            detail: 'No target date projection for maintenance goals.'
        };
    }

    const caloriesPerUnit = unitLabel === 'lb' ? 3500 : 7700;
    const baselineWeight = typeof currentWeight === 'number' && Number.isFinite(currentWeight) ? currentWeight : startWeight;

    const baselineDate =
        currentWeightDate ? parseDateOnlyToLocalDate(currentWeightDate) : startOfLocalDay(parseDateTime(goalCreatedAt) ?? new Date());

    if (!baselineDate) {
        return {
            projectedDate: null,
            projectedDateLabel: '—',
            detail: 'Unable to compute a projection date right now.'
        };
    }

    const paceLabel = formatDailyCalorieChange(dailyDeficit);

    // Validate that the calorie direction matches the *goal definition* (start -> target).
    // This avoids mislabeling "overshot" goals as invalid when the current weight is beyond the target.
    if (dailyDeficit > 0 && targetWeight > startWeight) {
        return {
            projectedDate: null,
            projectedDateLabel: '—',
            detail: `Projection unavailable: ${paceLabel} implies weight loss, but your target is above your start weight.`
        };
    }
    if (dailyDeficit < 0 && targetWeight < startWeight) {
        return {
            projectedDate: null,
            projectedDateLabel: '—',
            detail: `Projection unavailable: ${paceLabel} implies weight gain, but your target is below your start weight.`
        };
    }

    const remaining =
        dailyDeficit > 0
            ? Math.max(0, baselineWeight - targetWeight)
            : Math.max(0, targetWeight - baselineWeight);

    const daysToTarget = remaining === 0 ? 0 : Math.ceil((remaining * caloriesPerUnit) / Math.abs(dailyDeficit));
    const projectedDate = addDays(baselineDate, daysToTarget);
    const baselineLabel = currentWeightDate ? `from your latest weigh-in (${formatDateValue(baselineDate)})` : 'from your goal start';

    return {
        projectedDate,
        projectedDateLabel: formatDateValue(projectedDate),
        detail: `Based on ${paceLabel} ${baselineLabel}.`
    };
}

/**
 * GoalTracker
 *
 * Shows start/target/current weights and a progress visualization toward the goal.
 * For maintenance goals, the visualization represents proximity to the target (above/below).
 */
const GoalTracker: React.FC<{
    startWeight: number;
    targetWeight: number;
    currentWeight: number | null;
    unitLabel: string;
    goalMode: GoalMode;
    goalCreatedAt: string | null;
    dailyDeficit: number;
    currentWeightDate: string | null;
}> = ({ startWeight, targetWeight, currentWeight, unitLabel, goalMode, goalCreatedAt, dailyDeficit, currentWeightDate }) => {
    const mode = goalMode;
    const startDateLabel = formatDateLabel(goalCreatedAt);
    const projection = computeGoalProjection({
        goalMode: mode,
        unitLabel,
        startWeight,
        targetWeight,
        dailyDeficit,
        goalCreatedAt,
        currentWeight,
        currentWeightDate
    });

    if (mode === 'maintain') {
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
                    Current: {typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} ${unitLabel}` : '—'}
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
                                        backgroundColor: (theme) => theme.palette.action.hover,
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
                                        backgroundColor: (theme) => theme.palette.success.light,
                                        opacity: 0.6
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
                Current: {typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} ${unitLabel}` : '—'}
            </Typography>

            {progress ? (
                <Box sx={{ mt: 1.5 }}>
                    <Box sx={{ position: 'relative' }}>
                        <Box sx={{ position: 'absolute', left: `${progress.percent}%`, top: -6, transform: 'translateX(-50%)' }}>
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
                                backgroundColor: (theme) => theme.palette.action.hover,
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
 * GoalEditor
 *
 * Form for creating a goal (first-time or replacement). We always create a new goal
 * record so the start date resets and previous goals remain historically available.
 */
const GoalEditor: React.FC<{
    weightUnitLabel: string;
    initialStartWeight: number | null;
    initialTargetWeight: number | null;
    initialDailyDeficit: number | null;
    submitLabel: string;
    onSaved: () => void;
    onCancel?: () => void;
}> = ({ weightUnitLabel, initialStartWeight, initialTargetWeight, initialDailyDeficit, submitLabel, onSaved, onCancel }) => {
    const queryClient = useQueryClient();

    const [startWeightInput, setStartWeightInput] = useState<string | null>(null);
    const [targetWeightInput, setTargetWeightInput] = useState<string | null>(null);
    const [dailyDeficitInput, setDailyDeficitInput] = useState<string | null>(null);
    const initialGoalMode = useMemo<GoalMode>(() => {
        if (typeof initialDailyDeficit !== 'number' || !Number.isFinite(initialDailyDeficit)) return 'lose';
        return getGoalModeFromDailyDeficit(initialDailyDeficit);
    }, [initialDailyDeficit]);

    const normalizedInitialDailyDeficitAbs = useMemo(() => {
        if (initialGoalMode === 'maintain') return 0;
        return normalizeDailyDeficitChoiceAbsValue(initialDailyDeficit);
    }, [initialDailyDeficit, initialGoalMode]);

    const [goalMode, setGoalMode] = useState<GoalMode>(initialGoalMode);

    const [alert, setAlert] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const initialBaselineRef = useRef<{
        startWeight: number | null;
        targetWeight: number | null;
        goalMode: GoalMode;
        dailyDeficitAbs: number;
    }>({
        startWeight:
            typeof initialStartWeight === 'number' && Number.isFinite(initialStartWeight) ? roundWeight(initialStartWeight) : null,
        targetWeight:
            typeof initialTargetWeight === 'number' && Number.isFinite(initialTargetWeight) ? roundWeight(initialTargetWeight) : null,
        goalMode: initialGoalMode,
        dailyDeficitAbs: normalizedInitialDailyDeficitAbs
    });

    const startWeightValue = useMemo(() => {
        if (startWeightInput !== null) return startWeightInput;
        return typeof initialStartWeight === 'number' && Number.isFinite(initialStartWeight) ? initialStartWeight.toString() : '';
    }, [initialStartWeight, startWeightInput]);

    const targetWeightValue = useMemo(() => {
        if (targetWeightInput !== null) return targetWeightInput;
        return typeof initialTargetWeight === 'number' && Number.isFinite(initialTargetWeight) ? initialTargetWeight.toString() : '';
    }, [initialTargetWeight, targetWeightInput]);

    const dailyDeficitValue = useMemo(() => {
        if (dailyDeficitInput !== null) return dailyDeficitInput;
        return normalizeDailyDeficitChoiceAbsValue(initialDailyDeficit).toString();
    }, [dailyDeficitInput, initialDailyDeficit]);

    const hasChanges = useMemo(() => {
        const initial = initialBaselineRef.current;

        const parseMaybeWeight = (value: string): number | null => {
            const trimmed = value.trim();
            if (trimmed.length === 0) return null;
            const numeric = Number(trimmed);
            return Number.isFinite(numeric) ? roundWeight(numeric) : null;
        };

        const normalizedStart = parseMaybeWeight(startWeightValue);
        const normalizedTarget = parseMaybeWeight(targetWeightValue);

        const parsedDailyAbs = goalMode === 'maintain' ? 0 : Number.parseInt(dailyDeficitValue || '0', 10);
        const normalizedDailyAbs = Number.isFinite(parsedDailyAbs) ? parsedDailyAbs : null;

        if (initial.goalMode !== goalMode) return true;
        if (initial.startWeight !== normalizedStart) return true;
        if (initial.targetWeight !== normalizedTarget) return true;
        if (normalizedDailyAbs !== null && initial.dailyDeficitAbs !== normalizedDailyAbs) return true;
        if (normalizedDailyAbs === null && initial.dailyDeficitAbs !== 0) return true;
        return false;
    }, [dailyDeficitValue, goalMode, startWeightValue, targetWeightValue]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAlert(null);

        const startWeightNumber = Number(startWeightValue);
        const targetWeightNumber = Number(targetWeightValue);
        const validationError = validateGoalWeights({
            goalMode,
            startWeight: startWeightNumber,
            targetWeight: targetWeightNumber
        });
        if (validationError) {
            setAlert({ message: validationError, severity: 'error' });
            return;
        }

        setIsSaving(true);
        try {
            const deficitValue = goalMode === 'maintain' ? 0 : parseInt(dailyDeficitValue || '0', 10);
            const signedDeficit = goalMode === 'gain' ? -Math.abs(deficitValue) : Math.abs(deficitValue);

            await axios.post('/api/goals', {
                start_weight: startWeightValue,
                target_weight: targetWeightValue,
                daily_deficit: signedDeficit
            });

            setAlert({ message: 'Goal saved', severity: 'success' });
            setStartWeightInput(null);
            setTargetWeightInput(null);
            setDailyDeficitInput(null);

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['goal'] }),
                queryClient.invalidateQueries({ queryKey: ['profile'] }),
                queryClient.invalidateQueries({ queryKey: ['profile-summary'] })
            ]);

            onSaved();
        } catch (err) {
            if (axios.isAxiosError(err)) {
                const serverMessage = (err.response?.data as { message?: unknown } | undefined)?.message;
                if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
                    setAlert({ message: serverMessage, severity: 'error' });
                } else {
                    setAlert({ message: 'Failed to save goal', severity: 'error' });
                }
            } else {
                setAlert({ message: 'Failed to save goal', severity: 'error' });
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Box component="form" onSubmit={(e) => void handleSubmit(e)}>
            <Stack spacing={2}>
                <TextField
                    label={`Start Weight (${weightUnitLabel})`}
                    type="number"
                    value={startWeightValue}
                    onChange={(e) => {
                        setStartWeightInput(e.target.value);
                        setAlert(null);
                    }}
                    inputProps={{ step: 0.1 }}
                    required
                    fullWidth
                />
                <TextField
                    label={`Target Weight (${weightUnitLabel})`}
                    type="number"
                    value={targetWeightValue}
                    onChange={(e) => {
                        setTargetWeightInput(e.target.value);
                        setAlert(null);
                    }}
                    inputProps={{ step: 0.1 }}
                    required
                    fullWidth
                />

                <FormControl fullWidth>
                    <InputLabel>Goal type</InputLabel>
                    <Select
                        value={goalMode}
                        label="Goal type"
                        onChange={(e) => {
                            setGoalMode(e.target.value as GoalMode);
                            setAlert(null);
                        }}
                    >
                        <MenuItem value="lose">Lose weight (calorie deficit)</MenuItem>
                        <MenuItem value="maintain">Maintain weight</MenuItem>
                        <MenuItem value="gain">Gain weight (calorie surplus)</MenuItem>
                    </Select>
                </FormControl>

                {goalMode !== 'maintain' && (
                    <FormControl fullWidth>
                        <InputLabel>Daily calorie change</InputLabel>
                        <Select
                            value={dailyDeficitValue}
                            label="Daily calorie change"
                            onChange={(e) => {
                                setDailyDeficitInput(e.target.value);
                                setAlert(null);
                            }}
                        >
                            {DAILY_DEFICIT_CHOICE_STRINGS.map((val) => (
                                <MenuItem key={val} value={val}>
                                    {goalMode === 'gain' ? '+' : '-'}
                                    {val} Calories/day
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}

                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    {onCancel && (
                        <Button variant="text" onClick={onCancel} disabled={isSaving}>
                            Cancel
                        </Button>
                    )}
                    <Button type="submit" variant="contained" disabled={isSaving || !hasChanges}>
                        {isSaving ? 'Saving…' : submitLabel}
                    </Button>
                </Box>
            </Stack>

            {alert && (
                <Alert severity={alert.severity} sx={{ mt: 2 }}>
                    {alert.message}
                </Alert>
            )}
        </Box>
    );
};

const Goals: React.FC = () => {
    const { user } = useAuth();
    const unitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

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

    const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data]);
    const goal = goalQuery.data;

    const currentWeight = metrics.length > 0 ? metrics[0].weight : null;
    const goalMode = goal ? getGoalModeFromDailyDeficit(goal.daily_deficit) : null;

    const points = useMemo(() => {
        const parsed: WeightPoint[] = metrics
            .filter((metric) => typeof metric.weight === 'number' && Number.isFinite(metric.weight))
            .map((metric) => {
                const date = parseDateOnlyToLocalDate(metric.date);
                if (!date) return null;
                return { date, weight: metric.weight };
            })
            .filter((value): value is WeightPoint => value !== null);

        parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
        return parsed;
    }, [metrics]);

    const xData = useMemo(() => points.map((point) => point.date), [points]);
    const yData = useMemo(() => points.map((point) => point.weight), [points]);

    const targetIsValid = typeof goal?.target_weight === 'number' && Number.isFinite(goal.target_weight);
    const yDomain = useMemo(() => {
        const values = [...yData, ...(targetIsValid ? [goal!.target_weight] : [])];
        if (values.length === 0) return null;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = Math.max(0.1, max - min);
        const padding = range * 0.1;
        return { min: min - padding, max: max + padding };
    }, [goal, targetIsValid, yData]);

    const completion = useMemo(() => {
        if (!goal) return false;
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

    const [showReplaceGoal, setShowReplaceGoal] = useState(false);

    return (
        <Box sx={{ maxWidth: 960, mx: 'auto' }}>
            <Typography variant="h4" gutterBottom>
                Goals
            </Typography>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Weight Over Time
                </Typography>

                {points.length === 0 ? (
                    <Typography color="text.secondary">No weight entries yet.</Typography>
                ) : (
                    <LineChart
                        xAxis={[
                            {
                                data: xData,
                                scaleType: 'time',
                                valueFormatter: (value) =>
                                    new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value)
                            }
                        ]}
                        yAxis={[
                            {
                                min: yDomain?.min,
                                max: yDomain?.max,
                                label: `Weight (${unitLabel})`
                            }
                        ]}
                        series={[
                            {
                                data: yData,
                                label: 'Weight',
                                showMark: true
                            }
                        ]}
                        height={320}
                    >
                        {targetIsValid && (
                            <ChartsReferenceLine
                                y={goal!.target_weight}
                                label={`Target: ${goal!.target_weight.toFixed(1)} ${unitLabel}`}
                                lineStyle={{ strokeDasharray: '6 6' }}
                            />
                        )}
                    </LineChart>
                )}
            </Paper>

            {!goalQuery.isLoading && !goal ? (
                <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>
                        Set your first goal
                    </Typography>
                    <Typography color="text.secondary" sx={{ mb: 2 }}>
                        Set a target weight and daily deficit/surplus to track progress and calculate your daily calorie target.
                    </Typography>
                    <GoalEditor
                        weightUnitLabel={unitLabel}
                        initialStartWeight={typeof currentWeight === 'number' ? currentWeight : null}
                        initialTargetWeight={null}
                        initialDailyDeficit={500}
                        submitLabel="Save goal"
                        onSaved={() => setShowReplaceGoal(false)}
                    />
                </Paper>
            ) : goal ? (
                <>
                    <Paper sx={{ p: 2, mb: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            Goal tracker
                        </Typography>

                        {completion && (
                            <Alert severity="success" sx={{ mb: 2 }}>
                                {goalMode === 'maintain'
                                    ? `Nice work! You're on target for ${goal.target_weight.toFixed(1)} ${unitLabel}.`
                                    : `Congratulations! You've met or exceeded your goal of ${goal.target_weight.toFixed(1)} ${unitLabel}.`}
                            </Alert>
                        )}

                        <GoalTracker
                            startWeight={goal.start_weight}
                            targetWeight={goal.target_weight}
                            currentWeight={typeof currentWeight === 'number' ? currentWeight : null}
                            unitLabel={unitLabel}
                            goalMode={goalMode ?? 'lose'}
                            goalCreatedAt={goal.created_at ?? null}
                            dailyDeficit={goal.daily_deficit}
                            currentWeightDate={metrics.length > 0 ? metrics[0].date : null}
                        />
                    </Paper>

                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>
                            Goal details
                        </Typography>

                        <Stack spacing={0.75} sx={{ mb: 2 }}>
                            <Typography variant="body2" color="text.secondary">
                                Set on: {formatDateLabel(goal.created_at)}
                            </Typography>
                            <Typography>
                                Initial: {goal.start_weight.toFixed(1)} {unitLabel}
                            </Typography>
                            <Typography>
                                Current: {typeof currentWeight === 'number' ? `${currentWeight.toFixed(1)} ${unitLabel}` : '—'}
                            </Typography>
                            <Typography>
                                Target: {goal.target_weight.toFixed(1)} {unitLabel}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Goal type:{' '}
                                {goalMode === 'maintain' ? 'Maintain weight' : goalMode === 'gain' ? 'Gain weight' : 'Lose weight'}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Daily calorie change:{' '}
                                {goalMode === 'maintain'
                                    ? '0 Calories/day (maintenance)'
                                    : `${goalMode === 'gain' ? '+' : '-'}${Math.abs(goal.daily_deficit)} Calories/day`}
                            </Typography>
                        </Stack>

                        <Divider sx={{ my: 2 }} />

                        {!showReplaceGoal && (
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <Button variant="outlined" onClick={() => setShowReplaceGoal(true)}>
                                    Set a new goal
                                </Button>
                            </Box>
                        )}

                        {showReplaceGoal && (
                            <Box sx={{ mt: 2 }}>
                                <GoalEditor
                                    weightUnitLabel={unitLabel}
                                    initialStartWeight={typeof currentWeight === 'number' ? currentWeight : goal.start_weight}
                                    initialTargetWeight={goal.target_weight}
                                    initialDailyDeficit={goal.daily_deficit}
                                    submitLabel="Save new goal"
                                    onSaved={() => setShowReplaceGoal(false)}
                                    onCancel={() => setShowReplaceGoal(false)}
                                />
                            </Box>
                        )}
                    </Paper>
                </>
            ) : (
                <Paper sx={{ p: 2 }}>
                    <Typography color="text.secondary">Loading goal…</Typography>
                </Paper>
            )}
        </Box>
    );
};

export default Goals;
