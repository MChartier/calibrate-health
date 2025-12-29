import React, { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/LogoutRounded';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useTransientStatus } from '../hooks/useTransientStatus';
import AppCard from '../ui/AppCard';
import InlineStatusLine from '../ui/InlineStatusLine';
import SectionHeader from '../ui/SectionHeader';
import { getApiErrorMessage } from '../utils/apiError';

const MIN_PASSWORD_LENGTH = 8;

type Props = {
    /** Optional supporting copy shown under the "Account" header. */
    subtitle?: React.ReactNode;
};

/**
 * AccountSecurityCard
 *
 * A single surface for account-scoped actions (email display, password changes, and logout).
 * This keeps "account" concerns colocated on Settings, separate from the body/TDEE profile page.
 */
const AccountSecurityCard: React.FC<Props> = ({
    subtitle = 'View your email address, update your password, or log out.'
}) => {
    const navigate = useNavigate();
    const { user, logout, changePassword } = useAuth();
    const { status, showStatus, clearStatus } = useTransientStatus();

    const [passwordError, setPasswordError] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

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
     * Open the change-password dialog and clear any prior error/status.
     */
    const handlePasswordDialogOpen = () => {
        clearStatus();
        resetPasswordDialogFields();
        setIsPasswordDialogOpen(true);
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
        clearStatus();
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
            showStatus('Password updated.', 'success');
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

    /**
     * Clear the current session and return the user to the login screen.
     */
    const handleLogout = async () => {
        clearStatus();
        try {
            await logout();
            navigate('/login');
        } catch {
            showStatus('Failed to log out', 'error');
        }
    };

    return (
        <>
            <AppCard>
                <SectionHeader
                    title="Account"
                    subtitle={subtitle}
                    actions={
                        <Button variant="outlined" onClick={handlePasswordDialogOpen}>
                            Change Password
                        </Button>
                    }
                    sx={{ mb: 0.5 }}
                />

                <InlineStatusLine status={status} sx={{ mb: 1 }} />

                <Stack spacing={2}>
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

                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<LogoutIcon />}
                        onClick={() => void handleLogout()}
                        fullWidth
                    >
                        Log out
                    </Button>
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
        </>
    );
};

export default AccountSecurityCard;

