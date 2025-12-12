import React, { useState, useEffect } from 'react';
import { Typography, Box, TextField, Button, Alert, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Settings: React.FC = () => {
    const { user, updateWeightUnit } = useAuth();
    const [startWeight, setStartWeight] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [dailyDeficit, setDailyDeficit] = useState('500');
    const [message, setMessage] = useState('');
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';

    useEffect(() => {
        fetchGoal();
    }, []);

    const fetchGoal = async () => {
        try {
            const res = await axios.get('/api/goals');
            if (res.data) {
                setStartWeight(res.data.start_weight?.toString() ?? '');
                setTargetWeight(res.data.target_weight?.toString() ?? '');
                setDailyDeficit(res.data.daily_deficit?.toString() ?? '500');
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleWeightUnitChange = async (e: any) => {
        try {
            await updateWeightUnit(e.target.value);
            setMessage('Preferences updated');
            fetchGoal();
        } catch (err) {
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
        } catch (err) {
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
                onChange={(e) => setStartWeight(e.target.value)}
                inputProps={{ step: 0.1 }}
            />
            <TextField
                label={`Target Weight (${weightUnitLabel})`}
                type="number"
                fullWidth
                margin="normal"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
                inputProps={{ step: 0.1 }}
            />
            <TextField
                label="Daily Calorie Deficit"
                type="number"
                fullWidth
                margin="normal"
                value={dailyDeficit}
                onChange={(e) => setDailyDeficit(e.target.value)}
                helperText="Recommended: 250 - 1000"
            />
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>Save Goal</Button>
        </Box>
    );
};

export default Settings;
