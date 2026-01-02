import React, { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../context/useAuth';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';
import { useI18n } from '../i18n/useI18n';

const Login: React.FC = () => {
    const { t } = useI18n();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setError('');
            setIsSubmitting(true);
            await login(email, password);
            // Replace so mobile/PWA back navigation can't return to the login form after signing in.
            navigate('/log', { replace: true });
        } catch {
            setError(t('auth.invalidCredentials'));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AppPage maxWidth="form">
            <AppCard>
                <Stack component="form" spacing={2} onSubmit={handleSubmit}>
                    <SectionHeader title={t('auth.login')} />

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
                        autoComplete="current-password"
                        fullWidth
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isSubmitting}
                        required
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Button type="submit" variant="contained" fullWidth disabled={isSubmitting}>
                            {isSubmitting ? t('auth.loggingIn') : t('auth.login')}
                        </Button>
                        <Typography variant="body2">
                            {t('auth.noAccountPrompt')}{' '}
                            <Link component={RouterLink} to="/register">
                                {t('auth.register')}
                            </Link>
                        </Typography>
                    </Box>
                </Stack>
            </AppCard>
        </AppPage>
    );
};

export default Login;
