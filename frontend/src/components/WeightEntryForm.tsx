import React, { useId, useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment,
    Link,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddRounded';
import RemoveIcon from '@mui/icons-material/RemoveRounded';
import axios from 'axios';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatIsoDateForDisplay, getTodayIsoDate } from '../utils/date';
import { getApiErrorMessage } from '../utils/apiError';
import {
    findMetricOnOrBeforeDate,
    type MetricEntry,
    metricsQueryKey,
    toDatePart,
    useMetricsQuery
} from '../queries/metrics';

type Props = {
    onSuccess?: () => void;
    date?: string;
};

const WEIGHT_ENTRY_STEP = 0.1; // Weight logs are captured at 0.1 resolution (matches backend rounding).
const WEIGHT_ENTRY_MIN = 0.1; // Prevents obviously-invalid non-positive weights.

/**
 * Parse a weight input string into a finite number.
 *
 * Returns `null` for empty/invalid values so callers can distinguish "unset" from "0".
 */
function parseWeightInput(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Round a numeric weight to tenths to prevent floating point drift when stepping.
 */
function roundWeightToTenth(value: number): number {
    return Math.round(value * 10) / 10;
}

type WeightEntryFormContentProps = {
    entryDate: string;
    existingMetric: MetricEntry | null;
    prefillMetric: MetricEntry | null;
    isLoadingExistingMetric: boolean;
    isExistingMetricError: boolean;
    weightUnitLabel: string;
    onSuccess?: () => void;
};

/**
 * WeightEntryFormContent
 *
 * Uses a keyed subtree (see parent) so the input state can be initialized from the loaded metric
 * without synchronizing via effects (which our lint rules discourage).
 */
const WeightEntryFormContent: React.FC<WeightEntryFormContentProps> = ({
    entryDate,
    existingMetric,
    prefillMetric,
    isLoadingExistingMetric,
    isExistingMetricError,
    weightUnitLabel,
    onSuccess
}) => {
    const queryClient = useQueryClient();
    const [weight, setWeight] = useState(() => (prefillMetric ? String(prefillMetric.weight) : ''));
    const [error, setError] = useState<string | null>(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    const parsedWeight = useMemo(() => parseWeightInput(weight), [weight]);
    const entryDateLabel = useMemo(() => formatIsoDateForDisplay(entryDate), [entryDate]);
    const prefillDateLabel = useMemo(() => {
        if (!prefillMetric) return null;
        return formatIsoDateForDisplay(toDatePart(prefillMetric.date));
    }, [prefillMetric]);
    const weightFieldError = useMemo(() => {
        if (!weight.trim()) return null;
        if (parsedWeight === null) return 'Enter a valid number.';
        if (parsedWeight <= 0) return 'Weight must be positive.';
        if (parsedWeight < WEIGHT_ENTRY_MIN) return `Weight must be at least ${WEIGHT_ENTRY_MIN} ${weightUnitLabel}.`;
        return null;
    }, [parsedWeight, weight, weightUnitLabel]);

    const saveMutation = useMutation({
        mutationFn: async () => {
            await axios.post('/api/metrics', { weight, date: entryDate });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: metricsQueryKey() });
            await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
            await queryClient.invalidateQueries({ queryKey: ['profile'] });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            await axios.delete(`/api/metrics/${encodeURIComponent(String(id))}`);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: metricsQueryKey() });
            await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
            await queryClient.invalidateQueries({ queryKey: ['profile'] });
        }
    });

    const handleSave = async () => {
        setError(null);
        try {
            await saveMutation.mutateAsync();
            setWeight('');
            onSuccess?.();
        } catch (err) {
            setError(getApiErrorMessage(err) ?? 'Unable to save weight right now.');
        }
    };

    /**
     * Handle form submission so pressing Enter saves the weigh-in.
     */
    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (saveMutation.isPending || deleteMutation.isPending || isLoadingExistingMetric) return;
        if (!weight.trim() || weightFieldError) return;
        void handleSave();
    };

    const handleConfirmDelete = async () => {
        if (!existingMetric) return;
        setError(null);
        try {
            await deleteMutation.mutateAsync(existingMetric.id);
            setIsDeleteConfirmOpen(false);
            setWeight('');
            onSuccess?.();
        } catch (err) {
            setError(getApiErrorMessage(err) ?? 'Unable to delete weight entry right now.');
        }
    };

    /**
     * Adjust the weight input up/down by a single step, clamped to the minimum.
     *
     * Uses the current input when valid, otherwise falls back to the best available prior value.
     */
    const stepperBase = (parsedWeight !== null && parsedWeight > 0 ? parsedWeight : prefillMetric?.weight) ?? null;

    const rawFormId = useId();
    const formId = `weight-entry-form-${rawFormId.replace(/:/g, '')}`;

    const handleStepWeight = (delta: number) => {
        if (stepperBase === null) return;
        const next = Math.max(WEIGHT_ENTRY_MIN, roundWeightToTenth(stepperBase + delta));
        setWeight(next.toFixed(1));
    };

    const isBusy = isLoadingExistingMetric || saveMutation.isPending || deleteMutation.isPending;
    const canSubmit = !isBusy && !!weight.trim() && !weightFieldError;
    const submitLabel = existingMetric ? 'Save Weight' : 'Add Weight';

    return (
        <>
            <DialogContent>
                <Stack spacing={2} component="form" id={formId} onSubmit={handleSubmit} sx={{ mt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {isExistingMetricError && !error && (
                        <Alert severity="warning">Unable to load the existing weight entry for this day.</Alert>
                    )}
                    {existingMetric && (
                        <Typography variant="body2" color="text.secondary">
                            Existing entry found for {entryDateLabel}. Saving will overwrite it.
                        </Typography>
                    )}

                    {!existingMetric && prefillMetric && (
                        <Typography variant="body2" color="text.secondary">
                            Prefilled from your last weigh-in ({prefillDateLabel ?? toDatePart(prefillMetric.date)}).
                        </Typography>
                    )}
                    <TextField
                        label={`Weight (${weightUnitLabel})`}
                        type="number"
                        fullWidth
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        autoFocus
                        inputProps={{ min: WEIGHT_ENTRY_MIN, step: WEIGHT_ENTRY_STEP, inputMode: 'decimal' }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        aria-label={`Decrease weight by ${WEIGHT_ENTRY_STEP} ${weightUnitLabel}`}
                                        size="small"
                                        edge="end"
                                        onClick={() => handleStepWeight(-WEIGHT_ENTRY_STEP)}
                                        disabled={isBusy || stepperBase === null}
                                    >
                                        <RemoveIcon fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                        aria-label={`Increase weight by ${WEIGHT_ENTRY_STEP} ${weightUnitLabel}`}
                                        size="small"
                                        edge="end"
                                        onClick={() => handleStepWeight(WEIGHT_ENTRY_STEP)}
                                        disabled={isBusy || stepperBase === null}
                                    >
                                        <AddIcon fontSize="small" />
                                    </IconButton>
                                </InputAdornment>
                            )
                        }}
                        error={Boolean(weightFieldError)}
                        helperText={weightFieldError ?? ' '}
                        disabled={isBusy}
                        required
                    />

                    <Typography variant="caption" color="text.secondary">
                        Want to change units? Update them in{' '}
                        <Link component={RouterLink} to="/settings">
                            Settings
                        </Link>
                        .
                    </Typography>
                </Stack>
            </DialogContent>

            <DialogActions>
                {existingMetric && (
                    <Button
                        type="button"
                        variant="outlined"
                        color="error"
                        onClick={() => setIsDeleteConfirmOpen(true)}
                        disabled={deleteMutation.isPending || saveMutation.isPending}
                    >
                        Delete
                    </Button>
                )}
                <Button
                    type="submit"
                    form={formId}
                    variant="contained"
                    disabled={!canSubmit}
                >
                    {submitLabel}
                </Button>
            </DialogActions>

            <Dialog open={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>Delete weight entry?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ mt: 1 }}>
                        Delete the weight entry for {entryDateLabel}? This cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsDeleteConfirmOpen(false)} disabled={deleteMutation.isPending}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={handleConfirmDelete}
                        disabled={deleteMutation.isPending}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

const WeightEntryForm: React.FC<Props> = ({ onSuccess, date }) => {
    const { user } = useAuth();
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    const entryDate = date ?? getTodayIsoDate(user?.timezone);

    const metricsQuery = useMetricsQuery();
    const metrics = useMemo(() => metricsQuery.data ?? [], [metricsQuery.data]);

    const existingMetric = useMemo(() => {
        return metrics.find((metric) => toDatePart(metric.date) === entryDate) ?? null;
    }, [entryDate, metrics]);

    const prefillMetric = useMemo(() => {
        if (existingMetric) return existingMetric;
        return findMetricOnOrBeforeDate(metrics, entryDate);
    }, [entryDate, existingMetric, metrics]);

    const contentKey = `${entryDate}:${existingMetric?.id ?? 'new'}:${prefillMetric?.id ?? 'none'}`;

    return (
        <WeightEntryFormContent
            key={contentKey}
            entryDate={entryDate}
            existingMetric={existingMetric}
            prefillMetric={prefillMetric}
            isLoadingExistingMetric={metricsQuery.isLoading}
            isExistingMetricError={metricsQuery.isError}
            weightUnitLabel={weightUnitLabel}
            onSuccess={onSuccess}
        />
    );
};

export default WeightEntryForm;
