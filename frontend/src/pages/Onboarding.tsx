import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { activityLevelOptions } from '../constants/activityLevels';
import { useQuery } from '@tanstack/react-query';
import { validateGoalWeights } from '../utils/goalValidation';
import { formatDateToLocalDateString } from '../utils/date';
import TimeZonePicker from '../components/TimeZonePicker';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import {
    parseUnitPreferenceKey,
    resolveUnitPreferenceKey,
    type UnitPreferenceKey
} from '../utils/unitPreferences';
import {
    DAILY_DEFICIT_CHOICE_STRINGS,
    DEFAULT_DAILY_DEFICIT_CHOICE_STRING,
    normalizeDailyDeficitChoiceAbsValue
} from '../../../shared/goalDeficit';

const Onboarding: React.FC = () => {
    const theme = useTheme();
    const sectionGap = theme.custom.layout.page.sectionGap;
    const { user, updateProfile, updateUnitPreferences } = useAuth();
    const navigate = useNavigate();

    const defaultUnitPreference = useMemo<UnitPreferenceKey>(() => {
        return resolveUnitPreferenceKey({ weight_unit: user?.weight_unit, height_unit: user?.height_unit });
    }, [user?.height_unit, user?.weight_unit]);
    const [unitPreference, setUnitPreference] = useState<UnitPreferenceKey>(defaultUnitPreference);
    const { heightUnit, weightUnit } = useMemo(() => parseUnitPreferenceKey(unitPreference), [unitPreference]);
    const weightUnitLabel = weightUnit === 'LB' ? 'lb' : 'kg';

    const detectedTimezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
    const [timezone, setTimezone] = useState<string>(user?.timezone ?? detectedTimezone);

    const [sex, setSex] = useState('');
    const [dob, setDob] = useState('');
    const [activityLevel, setActivityLevel] = useState('');
    const [heightCm, setHeightCm] = useState('');
    const [heightFeet, setHeightFeet] = useState('');
    const [heightInches, setHeightInches] = useState('');
    const [currentWeight, setCurrentWeight] = useState('');
    const [goalWeight, setGoalWeight] = useState('');
    const [goalMode, setGoalMode] = useState<'lose' | 'maintain' | 'gain'>('lose');
    const [dailyDeficit, setDailyDeficit] = useState(DEFAULT_DAILY_DEFICIT_CHOICE_STRING);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setUnitPreference(defaultUnitPreference);
    }, [defaultUnitPreference]);

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
            const hasTimezone =
                typeof profileQuery.data?.profile?.timezone === 'string' && profileQuery.data.profile.timezone.trim().length > 0;
            if (missing.length === 0 && hasGoal && hasTimezone) {
                navigate('/settings', { replace: true });
            }
        }
    }, [profileQuery.isSuccess, profileQuery.data, navigate]);

    const heightFieldsValid = useMemo(() => {
        if (heightUnit === 'CM') {
            return !!heightCm;
        }
        return !!heightFeet || !!heightInches;
    }, [heightCm, heightFeet, heightInches, heightUnit]);

    const handleSave = async () => {
        setError('');
        setSuccess('');
        if (!user) {
            setError('You must be logged in to continue.');
            return;
        }

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
            if (heightUnit === 'CM') {
                profilePayload.height_cm = heightCm || null;
            } else {
                profilePayload.height_feet = heightFeet || null;
                profilePayload.height_inches = heightInches || null;
            }

            await updateProfile(profilePayload);

            await updateUnitPreferences({ weight_unit: weightUnit, height_unit: heightUnit });

            const deficitValue = goalMode === 'maintain' ? 0 : normalizeDailyDeficitChoiceAbsValue(dailyDeficit);
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
        <AppPage maxWidth={720}>
            <Stack spacing={sectionGap} useFlexGap>
                <Box>
                    <Typography variant="h4" gutterBottom>
                        Welcome! Let&apos;s set up your targets
                    </Typography>
                    <Typography color="text.secondary">
                        We need a few details to estimate your calories burned and daily target. You can change these later from your profile and settings.
                    </Typography>
                </Box>

                <AppCard>
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
                            <Select value={activityLevel} label="Activity Level" onChange={(e) => setActivityLevel(e.target.value)}>
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

                        <TimeZonePicker
                            value={timezone}
                            onChange={setTimezone}
                            helperText="Used to define your day boundaries for food and weight logs."
                        />

                        <FormControl fullWidth required>
                            <InputLabel>Units</InputLabel>
                            <Select value={unitPreference} label="Units" onChange={(e) => setUnitPreference(e.target.value as UnitPreferenceKey)}>
                                <MenuItem value="CM_KG">Metric (cm, kg)</MenuItem>
                                <MenuItem value="FTIN_LB">Imperial (ft/in, lb)</MenuItem>
                                <MenuItem value="CM_LB">Mixed (cm, lb)</MenuItem>
                                <MenuItem value="FTIN_KG">Mixed (ft/in, kg)</MenuItem>
                            </Select>
                        </FormControl>

                        {heightUnit === 'CM' ? (
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
                                    {DAILY_DEFICIT_CHOICE_STRINGS.map((val) => (
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
                </AppCard>
            </Stack>
        </AppPage>
    );
};

export default Onboarding;
