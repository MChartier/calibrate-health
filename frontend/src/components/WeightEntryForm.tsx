import React, { useState } from 'react';
import { Button, Stack, TextField } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/useAuth';

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

const WeightEntryForm: React.FC<Props> = ({ onSuccess, date }) => {
    const { user } = useAuth();
    const [weight, setWeight] = useState('');
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    const handleAddWeight = async () => {
        const entryDate = date ?? getLocalDateString(new Date());
        await axios.post('/api/metrics', { weight, date: entryDate });
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
