import React, { useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    Link,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Link as RouterLink } from 'react-router-dom';
import { activityLevelOptions } from '../constants/activityLevels';
import TimeZonePicker from '../components/TimeZonePicker';
import { useAuth } from '../context/useAuth';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';
import { getApiErrorMessage } from '../utils/apiError';
import { getDefaultHeightUnitForWeightUnit } from '../utils/unitPreferences';

const MIN_PASSWORD_LENGTH = 8;

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
    const theme = useTheme();
    const { user, updateProfile, changePassword } = useAuth();
    const sectionGap = theme.custom.layout.page.sectionGap;
    const [profileMessage, setProfileMessage] = useState('');
    const [accountSuccess, setAccountSuccess] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

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

    /**
     * Open the change-password dialog and clear any prior error state.
     */
    const handlePasswordDialogOpen = () => {
        setAccountSuccess('');
        resetPasswordDialogFields();
        setIsPasswordDialogOpen(true);
    };

    /**
     * Clear sensitive input values used by the password dialog.
     */
    const resetPasswordDialogFields = () => {
        setPasswordError('');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
    };

    /**
     * Close the change-password dialog and clear sensitive input values.
     */
    const closePasswordDialog = () => {
        setIsPasswordDialogOpen(false);
        resetPasswordDialogFields();
    };

    /**
     * Close the change-password dialog (unless a request is in-flight).
     */
    const handlePasswordDialogClose = () => {
        if (isChangingPassword) return;
        closePasswordDialog();
    };

    /**
     * Change the current user's password after validating basic client-side constraints.
     */
    const handlePasswordChange = async () => {
        setAccountSuccess('');
        setPasswordError('');

        if (!currentPassword) {
            setPasswordError('Please enter your current password.');
            return;
        }

        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            setPasswordError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError('New passwords do not match.');
            return;
        }

        if (currentPassword === newPassword) {
            setPasswordError('New password must be different from your current password.');
            return;
        }

        setIsChangingPassword(true);
        try {
            await changePassword(currentPassword, newPassword);
            setAccountSuccess('Password updated.');
            closePasswordDialog();
        } catch (err) {
            setPasswordError(getApiErrorMessage(err) ?? 'Failed to update password.');
        } finally {
            setIsChangingPassword(false);
        }
    };

    /**
     * Keep the password form accessible by handling Enter-to-submit and preventing full-page reloads.
     */
    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void handlePasswordChange();
    };

    return (
        <AppPage maxWidth="content">
            <Stack spacing={sectionGap} useFlexGap>
                <Typography color="text.secondary">
                    Edit the info used to estimate your daily calorie burn (TDEE) and calorie math inputs.
                </Typography>

                <AppCard>
                    <SectionHeader title="Profile" sx={{ mb: 1.5 }} />

                    {profileMessage && (
                        <Alert severity="info" sx={{ mb: 2 }}>
                            {profileMessage}
                        </Alert>
                    )}

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
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Button variant="contained" onClick={() => void handleProfileSave()} disabled={profileQuery.isLoading}>
                            Save Profile
                        </Button>
                    </Stack>
                </AppCard>

                <AppCard>
                    <SectionHeader
                        title="Account"
                        subtitle="View your email address and update your password."
                        actions={
                            <Button variant="outlined" onClick={handlePasswordDialogOpen}>
                                Change Password
                            </Button>
                        }
                        sx={{ mb: 1.5 }}
                    />

                    <Stack spacing={1.5}>
                        {accountSuccess && <Alert severity="success">{accountSuccess}</Alert>}

                        <Typography variant="body2" color="text.secondary">
                            Email
                        </Typography>
                        <Box
                            sx={{
                                px: 2,
                                py: 1.5,
                                border: '1px solid',
                                borderColor: 'divider',
                                borderRadius: 1,
                                backgroundColor: 'action.hover'
                            }}
                        >
                            <Typography sx={{ wordBreak: 'break-word' }}>{user?.email ?? ''}</Typography>
                        </Box>
                    </Stack>
                </AppCard>

                <Dialog
                    open={isPasswordDialogOpen}
                    onClose={handlePasswordDialogClose}
                    fullWidth
                    maxWidth="xs"
                >
                    <DialogTitle>Change password</DialogTitle>
                    <DialogContent>
                        <Stack
                            spacing={2}
                            component="form"
                            id="change-password-form"
                            onSubmit={handlePasswordSubmit}
                            sx={{ pt: 1 }}
                        >
                            {passwordError && <Alert severity="error">{passwordError}</Alert>}

                            <TextField
                                label="Current Password"
                                type="password"
                                autoComplete="current-password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                disabled={isChangingPassword}
                                required
                                fullWidth
                            />

                            <TextField
                                label="New Password"
                                type="password"
                                autoComplete="new-password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                helperText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                                disabled={isChangingPassword}
                                inputProps={{ minLength: MIN_PASSWORD_LENGTH }}
                                required
                                fullWidth
                            />

                            <TextField
                                label="Confirm New Password"
                                type="password"
                                autoComplete="new-password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                disabled={isChangingPassword}
                                inputProps={{ minLength: MIN_PASSWORD_LENGTH }}
                                required
                                fullWidth
                            />
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={handlePasswordDialogClose} disabled={isChangingPassword}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            form="change-password-form"
                            variant="contained"
                            disabled={isChangingPassword}
                        >
                            {isChangingPassword ? 'Updating...' : 'Update Password'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Stack>
        </AppPage>
    );
};

export default Profile;
