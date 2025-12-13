import React, { useMemo, useState } from 'react';
import { Typography, Box, TextField, Button, Alert, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { useQuery } from '@tanstack/react-query';

const Settings: React.FC = () => {
    const { user, updateWeightUnit } = useAuth();
    const [startWeightInput, setStartWeightInput] = useState<string | null>(null);
    const [targetWeightInput, setTargetWeightInput] = useState<string | null>(null);
    const [dailyDeficitInput, setDailyDeficitInput] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    type GoalResponse = {
        start_weight: number;
        target_weight: number;
        daily_deficit: number;
    };

    const goalQuery = useQuery({
        queryKey: ['goal'],
        queryFn: async (): Promise<GoalResponse | null> => {
            const res = await axios.get('/api/goals');
            return res.data ?? null;
        }
    });

    const startWeight = useMemo(() => {
        if (startWeightInput !== null) return startWeightInput;
        const value = goalQuery.data?.start_weight;
        return typeof value === 'number' ? value.toString() : '';
    }, [goalQuery.data?.start_weight, startWeightInput]);

    const targetWeight = useMemo(() => {
        if (targetWeightInput !== null) return targetWeightInput;
        const value = goalQuery.data?.target_weight;
        return typeof value === 'number' ? value.toString() : '';
    }, [goalQuery.data?.target_weight, targetWeightInput]);

    const dailyDeficit = useMemo(() => {
        if (dailyDeficitInput !== null) return dailyDeficitInput;
        const value = goalQuery.data?.daily_deficit;
        return typeof value === 'number' ? value.toString() : '500';
    }, [dailyDeficitInput, goalQuery.data?.daily_deficit]);

    const handleWeightUnitChange = async (e: SelectChangeEvent) => {
        const nextUnit = e.target.value;
        if (nextUnit !== 'KG' && nextUnit !== 'LB') {
            setMessage('Failed to update preferences');
            return;
        }

        try {
            await updateWeightUnit(nextUnit);
            setStartWeightInput(null);
            setTargetWeightInput(null);
            setMessage('Preferences updated');
            void goalQuery.refetch();
        } catch {
            setMessage('Failed to update preferences');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await axios.post('/api/goals', {
                start_weight: startWeight,
                target_weight: targetWeight,
                daily_deficit: dailyDeficit
            });
            setMessage('Goal updated successfully');
            setStartWeightInput(null);
            setTargetWeightInput(null);
            setDailyDeficitInput(null);
            void goalQuery.refetch();
        } catch {
            setMessage('Failed to update goal');
        }
    };

    return (
        <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
            <Typography variant="h4" gutterBottom>Settings & Goals</Typography>
            {message && <Alert severity="info" sx={{ mb: 2 }}>{message}</Alert>}
            <FormControl fullWidth margin="normal">
                <InputLabel>Weight Unit</InputLabel>
                <Select
                    value={user?.weight_unit ?? 'KG'}
                    label="Weight Unit"
                    onChange={handleWeightUnitChange}
                >
                    <MenuItem value="KG">Kilograms (kg)</MenuItem>
                    <MenuItem value="LB">Pounds (lb)</MenuItem>
                </Select>
            </FormControl>
            <TextField
                label={`Start Weight (${weightUnitLabel})`}
                type="number"
                fullWidth
                margin="normal"
                value={startWeight}
                onChange={(e) => setStartWeightInput(e.target.value)}
                inputProps={{ step: 0.1 }}
            />
            <TextField
                label={`Target Weight (${weightUnitLabel})`}
                type="number"
                fullWidth
                margin="normal"
                value={targetWeight}
                onChange={(e) => setTargetWeightInput(e.target.value)}
                inputProps={{ step: 0.1 }}
            />
            <TextField
                label="Daily Calorie Deficit"
                type="number"
                fullWidth
                margin="normal"
                value={dailyDeficit}
                onChange={(e) => setDailyDeficitInput(e.target.value)}
                helperText="Recommended: 250 - 1000"
            />
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>Save Goal</Button>
        </Box>
    );
};

export default Settings;
