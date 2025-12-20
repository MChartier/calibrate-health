import React, { useMemo, useState } from 'react';
import { Typography, Box, TextField, Button, Alert, FormControl, InputLabel, Select, MenuItem, Paper, FormHelperText } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { useQuery } from '@tanstack/react-query';
import { useThemeMode } from '../context/useThemeMode';
import type { ThemePreference } from '../context/themeModeContext';

const Settings: React.FC = () => {
    const { user, updateWeightUnit } = useAuth();
    const { preference: themePreference, mode: resolvedThemeMode, setPreference: setThemePreference } = useThemeMode();
    const [startWeightInput, setStartWeightInput] = useState<string | null>(null);
    const [targetWeightInput, setTargetWeightInput] = useState<string | null>(null);
    const [dailyDeficitInput, setDailyDeficitInput] = useState<string | null>(null);
    const [goalMode, setGoalMode] = useState<'lose' | 'maintain' | 'gain'>('lose');
    const [unitMessage, setUnitMessage] = useState('');
    const [goalMessage, setGoalMessage] = useState('');
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
        return typeof value === 'number' ? Math.abs(value).toString() : '500';
    }, [dailyDeficitInput, goalQuery.data?.daily_deficit]);

    React.useEffect(() => {
        const value = goalQuery.data?.daily_deficit;
        if (typeof value === 'number') {
            if (value === 0) setGoalMode('maintain');
            else if (value > 0) setGoalMode('lose');
            else setGoalMode('gain');
        }
    }, [goalQuery.data?.daily_deficit]);

    const handleWeightUnitChange = async (e: SelectChangeEvent) => {
        const nextUnit = e.target.value;
        if (nextUnit !== 'KG' && nextUnit !== 'LB') {
            setUnitMessage('Failed to update preferences');
            return;
        }

        try {
            await updateWeightUnit(nextUnit);
            setStartWeightInput(null);
            setTargetWeightInput(null);
            setUnitMessage('Preferences updated');
            void goalQuery.refetch();
        } catch {
            setUnitMessage('Failed to update preferences');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const deficitValue = goalMode === 'maintain' ? 0 : parseInt(dailyDeficit || '0', 10);
            const signedDeficit = goalMode === 'gain' ? -Math.abs(deficitValue) : Math.abs(deficitValue);
            await axios.post('/api/goals', {
                start_weight: startWeight,
                target_weight: targetWeight,
                daily_deficit: signedDeficit
            });
            setGoalMessage('Goal updated successfully');
            setStartWeightInput(null);
            setTargetWeightInput(null);
            setDailyDeficitInput(null);
            void goalQuery.refetch();
        } catch {
            setGoalMessage('Failed to update goal');
        }
    };

    return (
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
            <Typography variant="h4" gutterBottom>Settings</Typography>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Units & Localization</Typography>
                {unitMessage && <Alert severity="info" sx={{ mb: 2 }}>{unitMessage}</Alert>}
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
            </Paper>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Appearance</Typography>
                <FormControl fullWidth margin="normal">
                    <InputLabel>Theme</InputLabel>
                    <Select
                        value={themePreference}
                        label="Theme"
                        onChange={(e) => setThemePreference(e.target.value as ThemePreference)}
                    >
                        <MenuItem value="system">System</MenuItem>
                        <MenuItem value="light">Light</MenuItem>
                        <MenuItem value="dark">Dark</MenuItem>
                    </Select>
                    <FormHelperText>
                        {themePreference === 'system'
                            ? `Following your device setting (currently ${resolvedThemeMode}).`
                            : 'Persisted on this device.'}
                    </FormHelperText>
                </FormControl>
            </Paper>

            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Goals</Typography>
                <Box component="form" onSubmit={handleSubmit}>
                    {goalMessage && <Alert severity="info" sx={{ mb: 2 }}>{goalMessage}</Alert>}
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
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Goal type</InputLabel>
                        <Select
                            value={goalMode}
                            label="Goal type"
                            onChange={(e) => setGoalMode(e.target.value as 'lose' | 'maintain' | 'gain')}
                        >
                            <MenuItem value="lose">Lose weight (calorie deficit)</MenuItem>
                            <MenuItem value="maintain">Maintain weight</MenuItem>
                            <MenuItem value="gain">Gain weight (calorie surplus)</MenuItem>
                        </Select>
                    </FormControl>

                    {goalMode !== 'maintain' && (
                        <FormControl fullWidth margin="normal">
                            <InputLabel>Daily calorie change</InputLabel>
                            <Select
                                value={dailyDeficit}
                                label="Daily calorie change"
                                onChange={(e) => setDailyDeficitInput(e.target.value)}
                            >
                                {['250', '500', '750', '1000'].map((val) => (
                                    <MenuItem key={val} value={val}>
                                        {goalMode === 'gain' ? '+' : '-'}
                                        {val} Calories/day
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                    <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>Save Goal</Button>
                </Box>
            </Paper>
        </Box>
    );
};

export default Settings;
