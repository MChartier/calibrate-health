import React, { useMemo, useState } from 'react';
import { Typography, Box, TextField, Button, Alert, Autocomplete, FormControl, InputLabel, Select, MenuItem, Stack, Paper } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import { useQuery } from '@tanstack/react-query';
import { activityLevelOptions } from '../constants/activityLevels';
import { getBrowserTimeZone, getSupportedTimeZones } from '../utils/timeZone';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '../utils/apiError';
import { useUserProfileQuery } from '../queries/userProfile';

const Settings: React.FC = () => {
    const { user, updateWeightUnit, updateTimezone, logout } = useAuth();
    const navigate = useNavigate();
    const [startWeightInput, setStartWeightInput] = useState<string | null>(null);
    const [targetWeightInput, setTargetWeightInput] = useState<string | null>(null);
    const [dailyDeficitInput, setDailyDeficitInput] = useState<string | null>(null);
    const [goalMode, setGoalMode] = useState<'lose' | 'maintain' | 'gain'>('lose');
    const [unitMessage, setUnitMessage] = useState('');
    const [timeZoneMessage, setTimeZoneMessage] = useState('');
    const [timezoneInput, setTimezoneInput] = useState<string | null>(null);
    const [goalMessage, setGoalMessage] = useState('');
    const weightUnitLabel = user?.weight_unit === 'LB' ? 'lb' : 'kg';
    const [profileMessage, setProfileMessage] = useState('');
    const timeZoneOptions = useMemo(() => getSupportedTimeZones(), []);

    const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
    const [sex, setSex] = useState<string | null>(null);
    const [heightCm, setHeightCm] = useState<string | null>(null);
    const [heightFeet, setHeightFeet] = useState<string | null>(null);
    const [heightInches, setHeightInches] = useState<string | null>(null);
    const [heightUnit, setHeightUnit] = useState<'cm' | 'ftin'>('cm');
    const [activityLevel, setActivityLevel] = useState<string | null>(null);

    type GoalResponse = {
        start_weight: number;
        target_weight: number;
        daily_deficit: number;
    };

    type ProfilePatchPayload = {
        date_of_birth: string | null;
        sex: string | null;
        activity_level: string | null;
        height_cm?: string | null;
        height_feet?: string | null;
        height_inches?: string | null;
    };

    const goalQuery = useQuery({
        queryKey: ['goal'],
        queryFn: async (): Promise<GoalResponse | null> => {
            const res = await axios.get('/api/goals');
            return res.data ?? null;
        }
    });

    const profileQuery = useUserProfileQuery();

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

    const dobValue = useMemo(() => {
        if (dateOfBirth !== null) return dateOfBirth;
        const value = profileQuery.data?.profile.date_of_birth;
        return value ? value.slice(0, 10) : '';
    }, [dateOfBirth, profileQuery.data?.profile.date_of_birth]);

    const sexValue = useMemo(() => {
        if (sex !== null) return sex;
        const value = profileQuery.data?.profile.sex;
        return value ?? '';
    }, [sex, profileQuery.data?.profile.sex]);

    const parsedHeight = useMemo(() => {
        const mm = profileQuery.data?.profile.height_mm;
        if (!mm) return null;
        const cm = Math.round(mm) / 10;
        const totalInches = mm / 25.4;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round((totalInches - feet * 12) * 10) / 10;
        return { mm, cm, feet, inches };
    }, [profileQuery.data?.profile.height_mm]);

    const heightCmValue = useMemo(() => {
        if (heightCm !== null) return heightCm;
        return parsedHeight ? parsedHeight.cm.toString() : '';
    }, [heightCm, parsedHeight]);

    const heightFeetValue = useMemo(() => {
        if (heightFeet !== null) return heightFeet;
        return parsedHeight ? parsedHeight.feet.toString() : '';
    }, [heightFeet, parsedHeight]);

    const heightInchesValue = useMemo(() => {
        if (heightInches !== null) return heightInches;
        return parsedHeight ? parsedHeight.inches.toString() : '';
    }, [heightInches, parsedHeight]);

    const activityValue = useMemo(() => {
        if (activityLevel !== null) return activityLevel;
        const value = profileQuery.data?.profile.activity_level;
        return value ?? '';
    }, [activityLevel, profileQuery.data?.profile.activity_level]);

    const timezoneValue = useMemo(() => {
        if (timezoneInput !== null) return timezoneInput;
        return user?.timezone ?? getBrowserTimeZone();
    }, [timezoneInput, user?.timezone]);

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
        } catch (err) {
            setUnitMessage(getApiErrorMessage(err) ?? 'Failed to update preferences');
        }
    };

    const handleTimezoneSave = async () => {
        const nextTimezone = timezoneValue.trim();
        if (!nextTimezone) {
            setTimeZoneMessage('Timezone is required');
            return;
        }

        try {
            await updateTimezone(nextTimezone);
            setTimezoneInput(null);
            setTimeZoneMessage('Timezone updated');
        } catch (err) {
            setTimeZoneMessage(getApiErrorMessage(err) ?? 'Failed to update timezone');
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
        } catch (err) {
            setGoalMessage(getApiErrorMessage(err) ?? 'Failed to update goal');
        }
    };

    const handleProfileSave = async () => {
        try {
            const payload: ProfilePatchPayload = {
                date_of_birth: dobValue || null,
                sex: sexValue || null,
                activity_level: activityValue || null
            };
            if (heightUnit === 'cm') {
                payload.height_cm = heightCmValue || null;
            } else {
                payload.height_feet = heightFeetValue || null;
                payload.height_inches = heightInchesValue || null;
            }

            await axios.patch('/api/user/profile', payload);
            setProfileMessage('Profile updated');
            setDateOfBirth(null);
            setSex(null);
            setHeightCm(null);
            setHeightFeet(null);
            setHeightInches(null);
            setActivityLevel(null);
            void profileQuery.refetch();
        } catch (err) {
            setProfileMessage(getApiErrorMessage(err) ?? 'Failed to update profile');
        }
    };

    /**
     * End the user session and return to the login screen.
     */
    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    return (
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
            <Typography variant="h4" gutterBottom>Settings</Typography>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Units & Localization</Typography>
                {unitMessage && <Alert severity="info" sx={{ mb: 2 }}>{unitMessage}</Alert>}
                {timeZoneMessage && <Alert severity="info" sx={{ mb: 2 }}>{timeZoneMessage}</Alert>}
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

                <Autocomplete
                    freeSolo
                    options={timeZoneOptions}
                    value={timezoneValue}
                    onChange={(_, nextValue) => {
                        if (typeof nextValue === 'string') {
                            setTimezoneInput(nextValue);
                        }
                    }}
                    onInputChange={(_, nextInput) => setTimezoneInput(nextInput)}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            label="Time zone"
                            margin="normal"
                            helperText="Used to group your days, logs, and daily targets."
                            fullWidth
                        />
                    )}
                />
                <Button
                    variant="contained"
                    onClick={() => void handleTimezoneSave()}
                    disabled={!timezoneValue.trim() || timezoneValue.trim() === (user?.timezone ?? 'UTC')}
                    sx={{ mt: 1 }}
                >
                    Save time zone
                </Button>

                <FormControl fullWidth margin="normal">
                    <InputLabel>Height Units</InputLabel>
                    <Select
                        value={heightUnit}
                        label="Height Units"
                        onChange={(e) => setHeightUnit(e.target.value as 'cm' | 'ftin')}
                    >
                        <MenuItem value="cm">Centimeters</MenuItem>
                        <MenuItem value="ftin">Feet / Inches</MenuItem>
                    </Select>
                </FormControl>
            </Paper>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Profile</Typography>
                {profileMessage && <Alert severity="info" sx={{ mb: 2 }}>{profileMessage}</Alert>}
                <Stack spacing={2}>
                    <TextField
                        label="Date of Birth"
                        type="date"
                        InputLabelProps={{ shrink: true }}
                        value={dobValue}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        fullWidth
                    />
                    <FormControl fullWidth>
                        <InputLabel>Sex</InputLabel>
                        <Select value={sexValue} label="Sex" onChange={(e) => setSex(e.target.value)}>
                            <MenuItem value="MALE">Male</MenuItem>
                            <MenuItem value="FEMALE">Female</MenuItem>
                        </Select>
                    </FormControl>
                    {heightUnit === 'cm' ? (
                        <TextField
                            label="Height (cm)"
                            type="number"
                            value={heightCmValue}
                            onChange={(e) => setHeightCm(e.target.value)}
                            inputProps={{ min: 50, max: 272, step: 0.1 }}
                            fullWidth
                        />
                    ) : (
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Feet"
                                type="number"
                                value={heightFeetValue}
                                onChange={(e) => setHeightFeet(e.target.value)}
                                inputProps={{ min: 1, max: 8, step: 1 }}
                                fullWidth
                            />
                            <TextField
                                label="Inches"
                                type="number"
                                value={heightInchesValue}
                                onChange={(e) => setHeightInches(e.target.value)}
                                inputProps={{ min: 0, max: 11.9, step: 0.1 }}
                                fullWidth
                            />
                        </Box>
                    )}
                    <FormControl fullWidth>
                        <InputLabel>Activity Level</InputLabel>
                        <Select value={activityValue} label="Activity Level" onChange={(e) => setActivityLevel(e.target.value)}>
                            {activityLevelOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button variant="contained" onClick={() => void handleProfileSave()} disabled={profileQuery.isLoading}>
                            Save Profile
                        </Button>
                    </Box>
                    {profileQuery.data?.calorieSummary && (
                        <Alert severity={profileQuery.data.calorieSummary.dailyCalorieTarget ? 'success' : 'warning'}>
                            {profileQuery.data.calorieSummary.dailyCalorieTarget
                                ? `Estimated target: ${profileQuery.data.calorieSummary.dailyCalorieTarget} Calories/day`
                                : 'Add birthday, sex, height, activity level, weight, and goal to compute a daily target.'}
                        </Alert>
                    )}
                </Stack>
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

            <Paper sx={{ p: 2, mt: 3 }}>
                <Typography variant="h6" gutterBottom>
                    Account
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Signed in as <strong>{user?.email ?? '—'}</strong>
                </Typography>
                <Button
                    variant="outlined"
                    color="error"
                    onClick={() => void handleLogout()}
                >
                    Log out
                </Button>
            </Paper>
        </Box>
    );
};

export default Settings;
