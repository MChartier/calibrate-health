import React, { useState } from 'react';
import {
    Alert,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/useAuth';
import type { TransientStatusTone } from '../hooks/useTransientStatus';
import { useI18n } from '../i18n/useI18n';
import {
    canSubmitAccountDeletion,
    DELETE_ACCOUNT_CONFIRMATION,
    downloadAccountExport,
    getAccountDeletionErrorKind
} from '../utils/accountData';

type Props = {
    clearStatus: () => void;
    showStatus: (text: string, tone: TransientStatusTone) => void;
};

/**
 * Account-scoped data portability and destructive deletion controls.
 *
 * Sensitive confirmation state stays isolated from the surrounding sign-in security card.
 */
const AccountDataControls: React.FC<Props> = ({ clearStatus, showStatus }) => {
    const navigate = useNavigate();
    const { clearDeletedAccountSession } = useAuth();
    const { t } = useI18n();
    const [isExporting, setIsExporting] = useState(false);
    const [isDeletionDialogOpen, setIsDeletionDialogOpen] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [deletionPassword, setDeletionPassword] = useState('');
    const [deletionConfirmation, setDeletionConfirmation] = useState('');
    const [deletionError, setDeletionError] = useState('');

    /** Request the authenticated export as a blob so credentials never enter the URL or filename. */
    const handleAccountExport = async () => {
        clearStatus();
        setIsExporting(true);
        try {
            await downloadAccountExport({
                requestExport: async () => {
                    const response = await axios.get<Blob>('/api/user/account/export', { responseType: 'blob' });
                    const dispositionHeader = response.headers['content-disposition'];
                    return {
                        blob: response.data,
                        contentDisposition: typeof dispositionHeader === 'string' ? dispositionHeader : undefined
                    };
                },
                createObjectUrl: (blob) => URL.createObjectURL(blob),
                revokeObjectUrl: (url) => URL.revokeObjectURL(url),
                triggerDownload: (url, filename) => {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                }
            });
            showStatus(t('account.exportReady'), 'success');
        } catch {
            showStatus(t('account.exportFailed'), 'error');
        } finally {
            setIsExporting(false);
        }
    };

    /** Reset both secrets whenever the destructive dialog closes or reopens. */
    const resetDeletionFields = () => {
        setDeletionPassword('');
        setDeletionConfirmation('');
        setDeletionError('');
    };

    const handleDeletionDialogOpen = () => {
        clearStatus();
        resetDeletionFields();
        setIsDeletionDialogOpen(true);
    };

    const closeDeletionDialog = () => {
        setIsDeletionDialogOpen(false);
        resetDeletionFields();
    };

    const handleDeletionDialogClose = () => {
        if (isDeletingAccount) return;
        closeDeletionDialog();
    };

    /** Delete the server account, then clear account-scoped browser state without a second API call. */
    const handleAccountDeletion = async () => {
        setDeletionError('');
        if (!canSubmitAccountDeletion(deletionPassword, deletionConfirmation)) {
            setDeletionError(t('account.validation.confirmDeletion', { phrase: DELETE_ACCOUNT_CONFIRMATION }));
            return;
        }

        setIsDeletingAccount(true);
        try {
            await axios.delete('/api/user/account', { data: { current_password: deletionPassword } });
            closeDeletionDialog();
            clearDeletedAccountSession();
            navigate('/login', { replace: true });
        } catch (error) {
            const responseStatus = axios.isAxiosError(error) ? error.response?.status : undefined;
            const errorKind = getAccountDeletionErrorKind(responseStatus);
            setDeletionError(
                errorKind === 'verification' ? t('account.deleteFailedVerification') : t('account.deleteFailed')
            );
        } finally {
            setIsDeletingAccount(false);
        }
    };

    const handleDeletionSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        void handleAccountDeletion();
    };

    const canDeleteAccount = canSubmitAccountDeletion(deletionPassword, deletionConfirmation);

    return (
        <>
            <Stack spacing={1.25}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {t('account.dataTitle')}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('account.dataDescription')}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadRoundedIcon />}
                        onClick={() => void handleAccountExport()}
                        disabled={isExporting}
                    >
                        {isExporting ? t('account.exporting') : t('account.export')}
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteForeverRoundedIcon />}
                        onClick={handleDeletionDialogOpen}
                    >
                        {t('account.deleteAccount')}
                    </Button>
                </Stack>
            </Stack>

            <Dialog
                open={isDeletionDialogOpen}
                onClose={handleDeletionDialogClose}
                fullWidth
                maxWidth="xs"
            >
                <DialogTitle>{t('account.deleteDialogTitle')}</DialogTitle>
                <DialogContent>
                    <Stack
                        spacing={2}
                        component="form"
                        id="delete-account-form"
                        onSubmit={handleDeletionSubmit}
                        sx={{ pt: 1 }}
                    >
                        <Alert severity="warning">
                            <Typography variant="subtitle2" component="p">
                                {t('account.deleteWarning')}
                            </Typography>
                            <Typography variant="body2" component="p" sx={{ mt: 0.5 }}>
                                {t('account.deleteConsequences')}
                            </Typography>
                        </Alert>

                        {deletionError && <Alert severity="error">{deletionError}</Alert>}

                        <TextField
                            label={t('account.currentPassword')}
                            type="password"
                            autoComplete="current-password"
                            value={deletionPassword}
                            onChange={(event) => setDeletionPassword(event.target.value)}
                            helperText={t('account.deletePasswordHelp')}
                            disabled={isDeletingAccount}
                            required
                            fullWidth
                        />

                        <TextField
                            label={t('account.deleteConfirmationLabel')}
                            value={deletionConfirmation}
                            onChange={(event) => setDeletionConfirmation(event.target.value)}
                            helperText={t('account.deleteConfirmationHelp', { phrase: DELETE_ACCOUNT_CONFIRMATION })}
                            disabled={isDeletingAccount}
                            required
                            fullWidth
                            slotProps={{ htmlInput: { autoComplete: 'off', spellCheck: false } }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleDeletionDialogClose} disabled={isDeletingAccount}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        type="submit"
                        form="delete-account-form"
                        variant="contained"
                        color="error"
                        disabled={!canDeleteAccount || isDeletingAccount}
                    >
                        {isDeletingAccount ? t('account.deletingAccount') : t('account.deleteAccount')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AccountDataControls;
