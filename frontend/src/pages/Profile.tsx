import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    FormControl,
    Link,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link as RouterLink } from 'react-router-dom';
import { activityLevelOptions } from '../constants/activityLevels';
import TimeZonePicker from '../components/TimeZonePicker';
import { useAuth } from '../context/useAuth';
import { getDefaultHeightUnitForWeightUnit } from '../utils/unitPreferences';

type ProfileResponse = {
    profile: {
        timezone: string | null;
        date_of_birth: string | null;
        sex: 'MALE' | 'FEMALE' | null;
        height_mm: number | null;
        activity_level: 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE' | null;
        weight_unit: 'KG' | 'LB';
    };
    calorieSummary: {
        dailyCalorieTarget?: number;
        tdee?: number;
        missing: string[];
    };
};

type ProfileUpdatePayload = {
    timezone: string | null;
    date_of_birth: string | null;
    sex: string | null;
    activity_level: string | null;
    height_cm?: string | null;
    height_feet?: string | null;
    height_inches?: string | null;
};

type ParsedHeight = {
    cm: number;
    feet: number;
    inches: number;
};

/**
 * Convert a stored height in millimeters into values suitable for either cm input or ft/in input.
 */
function parseHeightFromMillimeters(mm: number): ParsedHeight {
    const cm = Math.round(mm) / 10;
    const totalInches = mm / 25.4;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round((totalInches - feet * 12) * 10) / 10;
    return { cm, feet, inches };
}

/**
 * Profile is the dedicated page for editing user-specific profile fields used for calorie math.
 */
const Profile: React.FC = () => {
    const { user, updateProfile } = useAuth();
    const [profileMessage, setProfileMessage] = useState('');

    const [timezone, setTimezone] = useState<string | null>(null);
    const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
    const [sex, setSex] = useState<string | null>(null);
    const [heightCm, setHeightCm] = useState<string | null>(null);
    const [heightFeet, setHeightFeet] = useState<string | null>(null);
    const [heightInches, setHeightInches] = useState<string | null>(null);
    const [activityLevel, setActivityLevel] = useState<string | null>(null);

    const profileQuery = useQuery({
        queryKey: ['profile'],
        queryFn: async (): Promise<ProfileResponse> => {
            const res = await axios.get('/api/user/profile');
            return res.data;
        }
    });

    const timezoneValue = useMemo(() => {
        if (timezone !== null) return timezone;
        const value = profileQuery.data?.profile.timezone;
        if (value) return value;
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }, [profileQuery.data?.profile.timezone, timezone]);

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
        return parseHeightFromMillimeters(mm);
    }, [profileQuery.data?.profile.height_mm]);

    const heightUnit = useMemo(() => {
        const weightUnit = user?.weight_unit;
        if (!weightUnit) return 'CM';
        return user?.height_unit ?? getDefaultHeightUnitForWeightUnit(weightUnit);
    }, [user?.height_unit, user?.weight_unit]);

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

    const handleProfileSave = async () => {
        try {
            const payload: ProfileUpdatePayload = {
                timezone: timezoneValue || null,
                date_of_birth: dobValue || null,
                sex: sexValue || null,
                activity_level: activityValue || null
            };

            if (heightUnit === 'CM') {
                payload.height_cm = heightCmValue || null;
            } else {
                payload.height_feet = heightFeetValue || null;
                payload.height_inches = heightInchesValue || null;
            }

            await updateProfile(payload);

            setProfileMessage('Profile updated');
            setTimezone(null);
            setDateOfBirth(null);
            setSex(null);
            setHeightCm(null);
            setHeightFeet(null);
            setHeightInches(null);
            setActivityLevel(null);
            void profileQuery.refetch();
        } catch {
            setProfileMessage('Failed to update profile');
        }
    };

    return (
        <Box sx={{ maxWidth: 720, mx: 'auto' }}>
            <Typography variant="h4" gutterBottom>Profile</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
                Edit the info used to estimate your daily calorie burn (TDEE) and calorie math inputs.
            </Typography>

            <Paper sx={{ p: 2 }}>
                {profileMessage && <Alert severity="info" sx={{ mb: 2 }}>{profileMessage}</Alert>}

                <Stack spacing={2}>
                    <TimeZonePicker
                        value={timezoneValue}
                        onChange={(next) => setTimezone(next)}
                        helperText="Used to define your day boundaries for food and weight logs."
                    />

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

                    {heightUnit === 'CM' ? (
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

                    <Typography variant="caption" color="text.secondary">
                        Units are configured in{' '}
                        <Link component={RouterLink} to="/settings">
                            Settings
                        </Link>
                        .
                    </Typography>

                    <FormControl fullWidth>
                        <InputLabel>Activity Level</InputLabel>
                        <Select value={activityValue} label="Activity Level" onChange={(e) => setActivityLevel(e.target.value)}>
                            {activityLevelOptions.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Button variant="contained" onClick={() => void handleProfileSave()} disabled={profileQuery.isLoading}>
                        Save Profile
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );
};

export default Profile;
