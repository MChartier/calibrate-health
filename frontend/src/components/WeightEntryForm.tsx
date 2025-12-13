import React, { useState } from 'react';
import { Button, Stack, TextField } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

type Props = {
    onSuccess?: () => void;
};

const WeightEntryForm: React.FC<Props> = ({ onSuccess }) => {
    const { user } = useAuth();
    const [weight, setWeight] = useState('');
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    const handleAddWeight = async () => {
        await axios.post('/api/metrics', { weight });
        setWeight('');
        onSuccess?.();
    };

    return (
        <Stack spacing={2}>
            <TextField
                label={`Weight (${weightUnitLabel})`}
                type="number"
                fullWidth
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                inputProps={{ step: 0.1 }}
            />
            <Button variant="contained" onClick={handleAddWeight} disabled={!weight}>
                Add Weight
            </Button>
        </Stack>
    );
};

export default WeightEntryForm;

