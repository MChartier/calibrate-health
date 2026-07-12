import React from 'react';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import EmailRoundedIcon from '@mui/icons-material/EmailRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import { Box, Button, Divider, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import AppCard from '../ui/AppCard';
import AppPage from '../ui/AppPage';
import { CALIBRATE_PRIVACY_EMAIL } from '../constants/links';
import {
    ACCOUNT_DELETION_COMPLETION_DAYS,
    ACCOUNT_DELETION_RESPONSE_DAYS,
    buildAccountDeletionRequestMailto
} from '../utils/accountDeletion';

const SECTION_SPACING = 1.25; // Keeps the policy-like sections readable without expanding the public page excessively.
const LIST_SX = { pl: 3, mt: 1, mb: 0, display: 'grid', gap: 0.5 };

/**
 * Stable public instructions for deleting hosted and self-hosted Calibrate accounts.
 */
const AccountDeletion: React.FC = () => {
    const requestMailto = buildAccountDeletionRequestMailto();

    return (
        <AppPage maxWidth="content">
            <AppCard>
                <Stack spacing={3} divider={<Divider flexItem />} useFlexGap>
                    <Box>
                        <Typography variant="h3" component="h1">
                            Delete your Calibrate account
                        </Typography>
                        <Typography variant="body1" sx={{ mt: 1.5 }}>
                            Calibrate Health ("Calibrate") is a food, weight, and activity tracking service. This page
                            explains how to permanently delete an account and its associated data.
                        </Typography>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            Delete immediately while signed in
                        </Typography>
                        <Stack spacing={SECTION_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                Sign in, open Settings, find Account, and choose Delete account. Enter your current password
                                to confirm. Deletion from the active Calibrate database is immediate and cannot be undone.
                            </Typography>
                            <Box>
                                <Button component={RouterLink} to="/login" variant="contained" startIcon={<LoginRoundedIcon />}>
                                    Sign in to Calibrate
                                </Button>
                            </Box>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            Request hosted-service deletion without the app
                        </Typography>
                        <Stack spacing={SECTION_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                If you cannot use the app, email the hosted Calibrate service from the address associated
                                with your account. We may ask you to demonstrate control of the address or account. Never
                                send your password by email.
                            </Typography>
                            <Typography variant="body1">
                                We aim to acknowledge requests within {ACCOUNT_DELETION_RESPONSE_DAYS} days and complete a
                                verified request within {ACCOUNT_DELETION_COMPLETION_DAYS} days, unless legal requirements
                                require a different period. To protect privacy, acknowledgements and status messages do not
                                disclose whether an email address belongs to a Calibrate account before verification.
                            </Typography>
                            <Box>
                                <Button component="a" href={requestMailto} variant="outlined" startIcon={<EmailRoundedIcon />}>
                                    Email a deletion request
                                </Button>
                            </Box>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                Hosted-service contact:{' '}
                                <Link href={`mailto:${CALIBRATE_PRIVACY_EMAIL}`}>{CALIBRATE_PRIVACY_EMAIL}</Link>
                            </Typography>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            Data deleted with the account
                        </Typography>
                        <Box component="ul" sx={LIST_SX}>
                            <Typography component="li" variant="body2">
                                Profile, preferences, inline avatar, goals, body metrics, food logs, completed-day state,
                                My Foods, and recipes
                            </Typography>
                            <Typography component="li" variant="body2">
                                Imported Health Connect source records, daily activity summaries, notifications, and
                                internal synchronization records
                            </Typography>
                            <Typography component="li" variant="body2">
                                Browser and mobile sessions, authentication tokens, and browser or native push subscriptions
                            </Typography>
                        </Box>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            Data that may remain temporarily
                        </Typography>
                        <Stack spacing={SECTION_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                Operator-managed backups and limited security logs may remain until their retention period
                                expires, or longer when required by law. They are not restored for normal product use after
                                deletion. Export files, shared copies, and app-local data on your devices remain under your
                                control and may need to be removed separately.
                            </Typography>
                        </Stack>
                    </Box>

                    <Box component="section">
                        <Typography variant="h5" component="h2">
                            Self-hosted Calibrate instances
                        </Typography>
                        <Stack spacing={SECTION_SPACING} sx={{ mt: 1.5 }} useFlexGap>
                            <Typography variant="body1">
                                A self-hosted instance is controlled by its operator, not the hosted Calibrate service. Use
                                that instance's signed-in deletion control or contact its operator. The operator is
                                responsible for database access, logs, backups, retention, and completing deletion requests;
                                {` ${CALIBRATE_PRIVACY_EMAIL}`} cannot access or delete data on an independently hosted server.
                            </Typography>
                        </Stack>
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} useFlexGap>
                        <Button component={RouterLink} to="/privacy" variant="text">
                            Read the privacy policy
                        </Button>
                        <Button component={RouterLink} to="/login" variant="text" startIcon={<DeleteForeverRoundedIcon />}>
                            Sign in to delete now
                        </Button>
                    </Stack>
                </Stack>
            </AppCard>
        </AppPage>
    );
};

export default AccountDeletion;
