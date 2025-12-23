import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { useAuth } from '../context/useAuth';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { activityLevelOptions } from '../constants/activityLevels';
import { useQuery } from '@tanstack/react-query';
import { validateGoalWeights } from '../utils/goalValidation';
import { formatDateToLocalDateString } from '../utils/date';

const Onboarding: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [weightUnit, setWeightUnit] = useState<'KG' | 'LB'>(user?.weight_unit ?? 'KG');
    const weightUnitLabel = weightUnit === 'LB' ? 'lb' : 'kg';

    const detectedTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
    const [timezone, setTimezone] = useState<string>(user?.timezone ?? detectedTimezone);

    const [sex, setSex] = useState('');
    const [dob, setDob] = useState('');
    const [activityLevel, setActivityLevel] = useState('');
    const [heightUnit, setHeightUnit] = useState<'cm' | 'ftin'>('cm');
    const [heightCm, setHeightCm] = useState('');
    const [heightFeet, setHeightFeet] = useState('');
    const [heightInches, setHeightInches] = useState('');
    const [currentWeight, setCurrentWeight] = useState('');
    const [goalWeight, setGoalWeight] = useState('');
    const [goalMode, setGoalMode] = useState<'lose' | 'maintain' | 'gain'>('lose');
    const [dailyDeficit, setDailyDeficit] = useState('500');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    type ProfileUpdatePayload = {
        timezone: string | null;
        date_of_birth: string | null;
        sex: string | null;
        activity_level: string | null;
        height_cm?: string | null;
        height_feet?: string | null;
        height_inches?: string | null;
    };

    const profileQuery = useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            const res = await axios.get('/api/user/profile');
            return res.data;
        },
        enabled: !!user
    });

    useEffect(() => {
        if (profileQuery.isSuccess) {
            const missing = profileQuery.data?.calorieSummary?.missing ?? [];
            const hasGoal = profileQuery.data?.goal_daily_deficit !== null && profileQuery.data?.goal_daily_deficit !== undefined;
            const hasTimezone = typeof profileQuery.data?.profile?.timezone === 'string' && profileQuery.data.profile.timezone.trim().length > 0;
            if (missing.length === 0 && hasGoal && hasTimezone) {
                navigate('/settings', { replace: true });
            }
        }
    }, [profileQuery.isSuccess, profileQuery.data, navigate]);

    const heightFieldsValid = useMemo(() => {
        if (heightUnit === 'cm') {
            return !!heightCm;
        }
        return !!heightFeet || !!heightInches;
    }, [heightCm, heightFeet, heightInches, heightUnit]);

    const handleSave = async () => {
        setError('');
        setSuccess('');

        const startWeightNumber = Number(currentWeight);
        const targetWeightNumber = Number(goalWeight);
        const goalValidationError = validateGoalWeights({
            goalMode,
            startWeight: startWeightNumber,
            targetWeight: targetWeightNumber
        });
        if (goalValidationError) {
            setError(goalValidationError);
            return;
        }

        setIsSaving(true);
        try {
            const profilePayload: ProfileUpdatePayload = {
                timezone: timezone.trim() || null,
                date_of_birth: dob || null,
                sex: sex || null,
                activity_level: activityLevel || null
            };
            if (heightUnit === 'cm') {
                profilePayload.height_cm = heightCm || null;
            } else {
                profilePayload.height_feet = heightFeet || null;
                profilePayload.height_inches = heightInches || null;
            }

            await axios.patch('/api/user/profile', profilePayload);

            await axios.patch('/api/user/preferences', { weight_unit: weightUnit });

            const deficitValue = goalMode === 'maintain' ? 0 : parseInt(dailyDeficit || '0', 10);
            const signedDeficit = goalMode === 'gain' ? -Math.abs(deficitValue) : Math.abs(deficitValue);

            await axios.post('/api/metrics', {
                weight: currentWeight,
                date: formatDateToLocalDateString(new Date(), timezone || detectedTimezone)
            });

            await axios.post('/api/goals', {
                start_weight: currentWeight,
                target_weight: goalWeight,
                daily_deficit: signedDeficit
            });

            setSuccess('Profile saved. Redirecting...');
            setTimeout(() => navigate('/dashboard'), 600);
        } catch (err) {
            console.error(err);
            if (axios.isAxiosError(err)) {
                const serverMessage = (err.response?.data as { message?: unknown } | undefined)?.message;
                if (typeof serverMessage === 'string' && serverMessage.trim().length > 0) {
                    setError(serverMessage);
                } else {
                    setError('Failed to save your profile. Please check the fields and try again.');
                }
            } else {
                setError('Failed to save your profile. Please check the fields and try again.');
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 720, mx: 'auto', mt: 4, px: 1 }}>
            <Typography variant="h4" gutterBottom>
                Welcome! Let&apos;s set up your targets
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
                We need a few details to estimate your calories burned and daily target. You can change these later from your profile.
            </Typography>

            <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {success && <Alert severity="success">{success}</Alert>}

                    <TextField
                        label="Date of Birth"
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        required
                    />

                    <FormControl fullWidth required>
                        <InputLabel>Sex</InputLabel>
                        <Select value={sex} label="Sex" onChange={(e) => setSex(e.target.value)}>
                            <MenuItem value="MALE">Male</MenuItem>
                            <MenuItem value="FEMALE">Female</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl fullWidth required>
                        <InputLabel>Activity Level</InputLabel>
                        <Select
                            value={activityLevel}
                            label="Activity Level"
                            onChange={(e) => setActivityLevel(e.target.value)}
                        >
                            {activityLevelOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>
                                    {option.label}
                                </MenuItem>
                            ))}
                        </Select>
                        <Typography variant="caption" color="text.secondary">
                            Used to estimate daily calorie burn (TDEE). Pick the closest match to your average week.
                        </Typography>
                    </FormControl>

                    <TextField
                        label="Timezone"
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        helperText="IANA timezone, e.g. America/Los_Angeles"
                        required
                    />

                    <FormControl fullWidth required>
                        <InputLabel>Weight Unit</InputLabel>
                        <Select
                            value={weightUnit}
                            label="Weight Unit"
                            onChange={(e) => setWeightUnit(e.target.value as 'KG' | 'LB')}
                        >
                            <MenuItem value="KG">Kilograms (kg)</MenuItem>
                            <MenuItem value="LB">Pounds (lb)</MenuItem>
                        </Select>
                    </FormControl>

                    <FormControl fullWidth required>
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

                    {heightUnit === 'cm' ? (
                        <TextField
                            label="Height (cm)"
                            type="number"
                            value={heightCm}
                            onChange={(e) => setHeightCm(e.target.value)}
                            inputProps={{ min: 50, max: 272, step: 0.1 }}
                            required
                        />
                    ) : (
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Feet"
                                type="number"
                                value={heightFeet}
                                onChange={(e) => setHeightFeet(e.target.value)}
                                inputProps={{ min: 1, max: 8, step: 1 }}
                                required
                            />
                            <TextField
                                label="Inches"
                                type="number"
                                value={heightInches}
                                onChange={(e) => setHeightInches(e.target.value)}
                                inputProps={{ min: 0, max: 11.9, step: 0.1 }}
                                required
                            />
                        </Box>
                    )}

                    <TextField
                        label={`Current Weight (${weightUnitLabel})`}
                        type="number"
                        value={currentWeight}
                        onChange={(e) => setCurrentWeight(e.target.value)}
                        inputProps={{ min: 1, step: 0.1 }}
                        required
                    />

                    <TextField
                        label={`Goal Weight (${weightUnitLabel})`}
                        type="number"
                        value={goalWeight}
                        onChange={(e) => setGoalWeight(e.target.value)}
                        inputProps={{ min: 1, step: 0.1 }}
                        required
                    />

                    <FormControl fullWidth>
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
                        <FormControl fullWidth>
                            <InputLabel>Daily calorie change</InputLabel>
                            <Select
                                value={dailyDeficit}
                                label="Daily calorie change"
                                onChange={(e) => setDailyDeficit(e.target.value)}
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

                    <Button
                        variant="contained"
                        onClick={() => void handleSave()}
                        disabled={
                            isSaving ||
                            !sex ||
                            !dob ||
                            !activityLevel ||
                            !timezone.trim() ||
                            !heightFieldsValid ||
                            !currentWeight ||
                            !goalWeight
                        }
                    >
                        {isSaving ? 'Saving…' : 'Save and continue'}
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );
};

export default Onboarding;
