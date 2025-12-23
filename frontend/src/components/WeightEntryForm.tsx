import React, { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Props = {
    onSuccess?: () => void;
    date?: string;
};

function getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

type MetricEntry = {
    id: number;
    date: string;
    weight: number;
};

/**
 * Fetch the current user's metric entry for a single day, if it exists.
 */
async function fetchMetricForDate(date: string): Promise<MetricEntry | null> {
    const res = await axios.get('/api/metrics', { params: { start: date, end: date } });
    const metrics = Array.isArray(res.data) ? (res.data as MetricEntry[]) : [];
    return metrics[0] ?? null;
}

type WeightEntryFormContentProps = {
    entryDate: string;
    existingMetric: MetricEntry | null;
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
    isLoadingExistingMetric,
    isExistingMetricError,
    weightUnitLabel,
    onSuccess
}) => {
    const queryClient = useQueryClient();
    const [weight, setWeight] = useState(() => (existingMetric ? String(existingMetric.weight) : ''));
    const [error, setError] = useState<string | null>(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

    const saveMutation = useMutation({
        mutationFn: async () => {
            await axios.post('/api/metrics', { weight, date: entryDate });
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['metrics'] });
            await queryClient.invalidateQueries({ queryKey: ['profile-summary'] });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            await axios.delete(`/api/metrics/${encodeURIComponent(String(id))}`);
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['metrics'] });
            await queryClient.invalidateQueries({ queryKey: ['profile-summary'] });
        }
    });

    const handleSave = async () => {
        setError(null);
        try {
            await saveMutation.mutateAsync();
            setWeight('');
            onSuccess?.();
        } catch (err) {
            console.error(err);
            setError('Unable to save weight right now.');
        }
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
            console.error(err);
            setError('Unable to delete weight entry right now.');
        }
    };

    return (
        <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            {isExistingMetricError && !error && (
                <Alert severity="warning">Unable to load the existing weight entry for this day.</Alert>
            )}
            {existingMetric && (
                <Typography variant="body2" color="text.secondary">
                    Existing entry found for {entryDate}. Saving will overwrite it.
                </Typography>
            )}
            <TextField
                label={`Weight (${weightUnitLabel})`}
                type="number"
                fullWidth
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputProps={{ step: 0.1 }}
                disabled={isLoadingExistingMetric}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
                {existingMetric && (
                    <Button
                        variant="outlined"
                        color="error"
                        onClick={() => setIsDeleteConfirmOpen(true)}
                        disabled={deleteMutation.isPending || saveMutation.isPending}
                    >
                        Delete
                    </Button>
                )}
                <Button
                    variant="contained"
                    onClick={handleSave}
                    disabled={!weight || deleteMutation.isPending || saveMutation.isPending || isLoadingExistingMetric}
                >
                    {existingMetric ? 'Save Weight' : 'Add Weight'}
                </Button>
            </Stack>

            <Dialog open={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} fullWidth maxWidth="xs">
                <DialogTitle>Delete weight entry?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ mt: 1 }}>
                        Delete the weight entry for {entryDate}? This cannot be undone.
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
        </Stack>
    );
};

const WeightEntryForm: React.FC<Props> = ({ onSuccess, date }) => {
    const { user } = useAuth();
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    const entryDate = date ?? getLocalDateString(new Date());

    const metricQuery = useQuery({
        queryKey: ['metrics', entryDate],
        queryFn: async () => fetchMetricForDate(entryDate)
    });

    const existingMetric = metricQuery.data ?? null;
    const contentKey = `${entryDate}:${existingMetric?.id ?? 'new'}`;

    return (
        <WeightEntryFormContent
            key={contentKey}
            entryDate={entryDate}
            existingMetric={existingMetric}
            isLoadingExistingMetric={metricQuery.isLoading}
            isExistingMetricError={metricQuery.isError}
            weightUnitLabel={weightUnitLabel}
            onSuccess={onSuccess}
        />
    );
};

export default WeightEntryForm;
