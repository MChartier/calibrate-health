import React, { useState, useEffect } from 'react';
import { Typography, Box, TextField, Button, Alert } from '@mui/material';
import axios from 'axios';

const Settings: React.FC = () => {
    const [startWeight, setStartWeight] = useState('');
    const [targetWeight, setTargetWeight] = useState('');
    const [dailyDeficit, setDailyDeficit] = useState('500');
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchGoal();
    }, []);

    const fetchGoal = async () => {
        try {
            const res = await axios.get('/api/goals');
            if (res.data) {
                setStartWeight(res.data.start_weight);
                setTargetWeight(res.data.target_weight);
                setDailyDeficit(res.data.daily_deficit);
            }
        } catch (err) {
            console.error(err);
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
            <TextField
                label="Start Weight (kg)"
                type="number"
                fullWidth
                margin="normal"
                value={startWeight}
                onChange={(e) => setStartWeight(e.target.value)}
            />
            <TextField
                label="Target Weight (kg)"
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
