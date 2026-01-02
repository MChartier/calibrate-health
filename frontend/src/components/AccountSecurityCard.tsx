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
import { useI18n } from '../i18n/useI18n';

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
    subtitle
}) => {
    const navigate = useNavigate();
    const { user, logout, changePassword } = useAuth();
    const { status, showStatus, clearStatus } = useTransientStatus();
    const { t } = useI18n();

    const resolvedSubtitle = subtitle ?? t('account.subtitle');

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
            setPasswordError(t('account.validation.enterCurrentPassword'));
            return;
        }

        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            setPasswordError(t('account.validation.passwordMinLength', { min: MIN_PASSWORD_LENGTH }));
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError(t('account.validation.passwordsDoNotMatch'));
            return;
        }

        if (currentPassword === newPassword) {
            setPasswordError(t('account.validation.passwordDifferent'));
            return;
        }

        setIsChangingPassword(true);
        try {
            await changePassword(currentPassword, newPassword);
            showStatus(t('account.passwordUpdated'), 'success');
            closePasswordDialog();
        } catch (err) {
            setPasswordError(getApiErrorMessage(err) ?? t('account.failedToUpdatePassword'));
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
            showStatus(t('account.failedToLogOut'), 'error');
        }
    };

    return (
        <>
            <AppCard>
                <SectionHeader
                    title={t('account.title')}
                    subtitle={resolvedSubtitle}
                    actions={
                        <Button variant="outlined" onClick={handlePasswordDialogOpen}>
                            {t('account.changePassword')}
                        </Button>
                    }
                    sx={{ mb: 0.5 }}
                />

                <InlineStatusLine status={status} sx={{ mb: 1 }} />

                <Stack spacing={2}>
                    <Stack spacing={1.5}>
                        <Typography variant="body2" color="text.secondary">
                            {t('account.email')}
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
                        {t('nav.logOut')}
                    </Button>
                </Stack>
            </AppCard>

            <Dialog
                open={isPasswordDialogOpen}
                onClose={handlePasswordDialogClose}
                fullWidth
                maxWidth="xs"
            >
                <DialogTitle>{t('account.changePasswordDialogTitle')}</DialogTitle>
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
                            label={t('account.currentPassword')}
                            type="password"
                            autoComplete="current-password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            disabled={isChangingPassword}
                            required
                            fullWidth
                        />

                        <TextField
                            label={t('account.newPassword')}
                            type="password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            helperText={t('account.passwordHint', { min: MIN_PASSWORD_LENGTH })}
                            disabled={isChangingPassword}
                            inputProps={{ minLength: MIN_PASSWORD_LENGTH }}
                            required
                            fullWidth
                        />

                        <TextField
                            label={t('account.confirmNewPassword')}
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
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="submit"
                        form="change-password-form"
                        variant="contained"
                        disabled={isChangingPassword}
                    >
                        {isChangingPassword ? t('common.updating') : t('account.updatePassword')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AccountSecurityCard;
