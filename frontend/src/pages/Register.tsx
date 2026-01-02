import React, { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../context/useAuth';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';
import { useI18n } from '../i18n/useI18n';

const Register: React.FC = () => {
    const { t } = useI18n();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setError('');
            setIsSubmitting(true);
            await register(email, password);
            // Replace so mobile/PWA back navigation can't return to registration after the account is created.
            navigate('/onboarding', { replace: true });
        } catch {
            setError(t('auth.registrationFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AppPage maxWidth="form">
            <AppCard>
                <Stack component="form" spacing={2} onSubmit={handleSubmit}>
                    <SectionHeader title={t('auth.createAccount')} />

                    {error && (
                        <Alert severity="error">
                            {error}
                        </Alert>
                    )}

                    <TextField
                        label={t('auth.email')}
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        autoFocus
                        fullWidth
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isSubmitting}
                        required
                    />
                    <TextField
                        label={t('auth.password')}
                        type="password"
                        autoComplete="new-password"
                        fullWidth
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isSubmitting}
                        required
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Button type="submit" variant="contained" fullWidth disabled={isSubmitting}>
                            {isSubmitting ? t('auth.creatingAccount') : t('auth.register')}
                        </Button>
                        <Typography variant="body2">
                            {t('auth.haveAccountPrompt')}{' '}
                            <Link component={RouterLink} to="/login">
                                {t('auth.login')}
                            </Link>
                        </Typography>
                    </Box>
                </Stack>
            </AppCard>
        </AppPage>
    );
};

export default Register;
