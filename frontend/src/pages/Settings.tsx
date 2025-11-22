import React, { useState, useEffect } from 'react';
import { Typography, Box, TextField, Button, Alert, ToggleButton, ToggleButtonGroup } from '@mui/material';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const Settings: React.FC = () => {
    const { user, updateUser } = useAuth();
    const [startWeight, setStartWeight] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [dailyDeficit, setDailyDeficit] = useState('500');
    const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (user?.weight_unit) {
            setWeightUnit(user.weight_unit);
        }
        fetchGoal();
    }, [user]);

    const fetchGoal = async () => {
        try {
            const res = await axios.get('/api/goals');
            if (res.data) {
                // Backend returns { value, unit } for weights
                setStartWeight(res.data.start_weight?.value || '');
                setTargetWeight(res.data.target_weight?.value || '');
                setDailyDeficit(res.data.daily_deficit);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleUnitChange = async (event: React.MouseEvent<HTMLElement>, newUnit: 'lbs' | 'kg') => {
        if (newUnit !== null) {
            setWeightUnit(newUnit);
            try {
                const res = await axios.put('/auth/settings', { weight_unit: newUnit });
                updateUser(res.data.user);
            } catch (err) {
                console.error('Failed to update unit preference');
            }
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

            <Box sx={{ mb: 3 }}>
                <Typography gutterBottom>Weight Unit</Typography>
                <ToggleButtonGroup
                    value={weightUnit}
                    exclusive
                    onChange={handleUnitChange}
                    aria-label="weight unit"
                >
                    <ToggleButton value="lbs" aria-label="lbs">
                        lbs
                    </ToggleButton>
                    <ToggleButton value="kg" aria-label="kg">
                        kg
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            <TextField
                label={`Start Weight (${weightUnit})`}
                type="number"
                fullWidth
                margin="normal"
                value={startWeight}
                onChange={(e) => setStartWeight(e.target.value)}
            />
            <TextField
                label={`Target Weight (${weightUnit})`}
                type="number"
                fullWidth
                margin="normal"
                value={targetWeight}
                onChange={(e) => setTargetWeight(e.target.value)}
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
