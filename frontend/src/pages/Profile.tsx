import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Link as RouterLink } from 'react-router-dom';
import CalorieTargetBanner from '../components/CalorieTargetBanner';
import { activityLevelOptions } from '../constants/activityLevels';
import ProfilePhotoCard from '../components/ProfilePhotoCard';
import { useTransientStatus } from '../hooks/useTransientStatus';
import type { UserProfilePatchPayload } from '../context/authContext';
import { useAuth } from '../context/useAuth';
import { useUserProfileQuery } from '../queries/userProfile';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import InlineStatusLine from '../ui/InlineStatusLine';
import SectionHeader from '../ui/SectionHeader';
import { getApiErrorMessage } from '../utils/apiError';
import { getDefaultHeightUnitForWeightUnit } from '../utils/unitPreferences';

const AUTOSAVE_DELAY_MS = 450;
const MIN_PASSWORD_LENGTH = 8;

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
 * Convert a draft input string to a patch-friendly nullable string.
 *
 * Notes:
 * - Empty strings are sent as null so the backend can clear optional fields.
 * - Whitespace is trimmed to avoid accidental invalid values.
 */
function normalizePatchString(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build a height patch from ft/in inputs.
 *
 * When both fields are empty, this explicitly clears the stored height via `height_mm: null`
 * (the backend interprets blank ft/in as 0 which would otherwise be invalid).
 */
function buildFeetInchesHeightPatch(feet: string, inches: string): UserProfilePatchPayload {
    const normalizedFeet = normalizePatchString(feet);
    const normalizedInches = normalizePatchString(inches);

    if (normalizedFeet === null && normalizedInches === null) {
        return { height_mm: null };
    }

    return { height_feet: normalizedFeet, height_inches: normalizedInches };
}

/**
 * Profile is the dedicated page for editing user-specific profile fields used for calorie math.
 */
const Profile: React.FC = () => {
    const theme = useTheme();
    const { user, updateProfile, changePassword } = useAuth();
    const sectionGap = theme.custom.layout.page.sectionGap;
    const { status: accountStatus, showStatus: showAccountStatus, clearStatus: clearAccountStatus } = useTransientStatus();
    const [passwordError, setPasswordError] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingPatchRef = useRef<UserProfilePatchPayload>({});
    const isSavingRef = useRef(false);

    const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [autosaveError, setAutosaveError] = useState<string | null>(null);

    const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
    const [sex, setSex] = useState<string | null>(null);
    const [heightCm, setHeightCm] = useState<string | null>(null);
    const [heightFeet, setHeightFeet] = useState<string | null>(null);
    const [heightInches, setHeightInches] = useState<string | null>(null);
    const [activityLevel, setActivityLevel] = useState<string | null>(null);

    const profileQuery = useUserProfileQuery();

    useEffect(() => {
        return () => {
            if (autosaveTimeoutRef.current) {
                clearTimeout(autosaveTimeoutRef.current);
                autosaveTimeoutRef.current = null;
            }
            if (savedMessageTimeoutRef.current) {
                clearTimeout(savedMessageTimeoutRef.current);
                savedMessageTimeoutRef.current = null;
            }
        };
    }, []);

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

    const autosaveStatusLine = useMemo(() => {
        if (autosaveError) return { text: autosaveError, tone: 'error' as const };
        if (autosaveStatus === 'saving') return { text: 'Saving...', tone: 'neutral' as const };
        if (autosaveStatus === 'saved') return { text: 'Saved', tone: 'success' as const };
        return null;
    }, [autosaveError, autosaveStatus]);

    /**
     * Flush any queued changes to the backend.
     *
     * Uses a ref-backed patch buffer so rapid edits across multiple inputs are saved together.
     */
    const flushAutosave = useCallback(async () => {
        if (isSavingRef.current) return;

        const patch = pendingPatchRef.current;
        if (Object.keys(patch).length === 0) return;

        pendingPatchRef.current = {};
        isSavingRef.current = true;
        setAutosaveStatus('saving');
        setAutosaveError(null);

        try {
            await updateProfile(patch);
            setAutosaveStatus('saved');

            if (savedMessageTimeoutRef.current) {
                clearTimeout(savedMessageTimeoutRef.current);
            }
            savedMessageTimeoutRef.current = setTimeout(() => setAutosaveStatus('idle'), 1500);
        } catch {
            // Merge the failed patch back so a subsequent edit retries with the latest values.
            pendingPatchRef.current = { ...patch, ...pendingPatchRef.current };
            setAutosaveStatus('error');
            setAutosaveError('Failed to save profile changes.');
        } finally {
            isSavingRef.current = false;
            if (Object.keys(pendingPatchRef.current).length > 0) {
                // If edits happened while saving, flush immediately after this request finishes.
                if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
                autosaveTimeoutRef.current = setTimeout(() => void flushAutosave(), 0);
            }
        }
    }, [updateProfile]);

    /**
     * Queue a profile patch and debounce writes so typing doesn't spam the API.
     */
    const queueAutosave = useCallback(
        (patch: UserProfilePatchPayload) => {
            // Height keys must be mutually exclusive depending on the active unit mode.
            if ('height_cm' in patch || 'height_feet' in patch || 'height_inches' in patch || 'height_mm' in patch) {
                delete pendingPatchRef.current.height_cm;
                delete pendingPatchRef.current.height_feet;
                delete pendingPatchRef.current.height_inches;
                delete pendingPatchRef.current.height_mm;
            }

            pendingPatchRef.current = { ...pendingPatchRef.current, ...patch };

            if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
            if (savedMessageTimeoutRef.current) {
                clearTimeout(savedMessageTimeoutRef.current);
                savedMessageTimeoutRef.current = null;
            }

            setAutosaveStatus('saving');
            setAutosaveError(null);

            autosaveTimeoutRef.current = setTimeout(() => void flushAutosave(), AUTOSAVE_DELAY_MS);
        },
        [flushAutosave]
    );

    /**
     * Open the change-password dialog and clear any prior error state.
     */
    const handlePasswordDialogOpen = () => {
        clearAccountStatus();
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
        clearAccountStatus();
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
            showAccountStatus('Password updated.', 'success');
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
                <CalorieTargetBanner />

                <Typography color="text.secondary">
                    Changes save automatically. Update the inputs below to recalculate your calorie target (TDEE +/- goal deficit).
                </Typography>

                <ProfilePhotoCard description="Used for your avatar in the app bar." />

                <AppCard>
                    <InlineStatusLine status={autosaveStatusLine} sx={{ mb: 1 }} ariaLive="off" />

                    <Stack spacing={2}>
                        <TextField
                            label="Date of Birth"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            value={dobValue}
                            onChange={(e) => {
                                const next = e.target.value;
                                setDateOfBirth(next);
                                queueAutosave({ date_of_birth: normalizePatchString(next) });
                            }}
                            fullWidth
                        />

                        <FormControl fullWidth>
                            <InputLabel>Sex</InputLabel>
                            <Select
                                value={sexValue}
                                label="Sex"
                                onChange={(e) => {
                                    const next = String(e.target.value);
                                    setSex(next);
                                    queueAutosave({ sex: normalizePatchString(next) });
                                }}
                            >
                                <MenuItem value="MALE">Male</MenuItem>
                                <MenuItem value="FEMALE">Female</MenuItem>
                            </Select>
                        </FormControl>

                        {heightUnit === 'CM' ? (
                            <TextField
                                label="Height (cm)"
                                type="number"
                                value={heightCmValue}
                                onChange={(e) => {
                                    const next = e.target.value;
                                    setHeightCm(next);
                                    queueAutosave({ height_cm: normalizePatchString(next) });
                                }}
                                inputProps={{ min: 50, max: 272, step: 0.1 }}
                                fullWidth
                            />
                        ) : (
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <TextField
                                    label="Feet"
                                    type="number"
                                    value={heightFeetValue}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setHeightFeet(next);
                                        queueAutosave(buildFeetInchesHeightPatch(next, heightInchesValue));
                                    }}
                                    inputProps={{ min: 1, max: 8, step: 1 }}
                                    fullWidth
                                />
                                <TextField
                                    label="Inches"
                                    type="number"
                                    value={heightInchesValue}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setHeightInches(next);
                                        queueAutosave(buildFeetInchesHeightPatch(heightFeetValue, next));
                                    }}
                                    inputProps={{ min: 0, max: 11.9, step: 0.1 }}
                                    fullWidth
                                />
                            </Box>
                        )}

                        <Typography variant="caption" color="text.secondary">
                            Units and timezone are configured in <Link component={RouterLink} to="/settings">Settings</Link>.
                        </Typography>

                        <FormControl fullWidth>
                            <InputLabel>Activity Level</InputLabel>
                            <Select
                                value={activityValue}
                                label="Activity Level"
                                onChange={(e) => {
                                    const next = String(e.target.value);
                                    setActivityLevel(next);
                                    queueAutosave({ activity_level: normalizePatchString(next) });
                                }}
                            >
                                {activityLevelOptions.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                        {option.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
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
                        sx={{ mb: 0.5 }}
                    />

                    <InlineStatusLine status={accountStatus} sx={{ mb: 1 }} />

                    <Stack spacing={1.5}>
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
