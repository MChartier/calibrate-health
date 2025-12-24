import React, { useState } from 'react';
import { Alert, Button, Stack, TextField } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { getTodayIsoDate } from '../utils/date';
import { getApiErrorMessage } from '../utils/apiError';

type Props = {
    onSuccess?: () => void;
    date?: string;
};

const WeightEntryForm: React.FC<Props> = ({ onSuccess, date }) => {
    const { user } = useAuth();
    const [weight, setWeight] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    /**
     * Handle form submission so pressing Enter saves the weigh-in.
     */
    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        void handleAddWeight();
    };

    const handleAddWeight = async () => {
        const entryDate = date ?? getTodayIsoDate(user?.timezone);
        setIsSubmitting(true);
        setError(null);
        try {
            await axios.post('/api/metrics', { weight, date: entryDate });
            setWeight('');
            onSuccess?.();
        } catch (err) {
            setError(getApiErrorMessage(err) ?? 'Unable to save your weigh-in right now.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Stack spacing={2} component="form" onSubmit={handleSubmit}>
            <TextField
                label={`Weight (${weightUnitLabel})`}
                type="number"
                fullWidth
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                disabled={isSubmitting}
                inputProps={{ step: 0.1 }}
                required
            />
            <Button type="submit" variant="contained" disabled={isSubmitting || !weight}>
                {isSubmitting ? 'Saving…' : 'Save weight'}
            </Button>
            {error && <Alert severity="error">{error}</Alert>}
        </Stack>
    );
};

export default WeightEntryForm;
