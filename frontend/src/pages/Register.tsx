import React, { useState } from 'react';
import { Alert, Box, Button, Link, TextField, Typography } from '@mui/material';
import PersonAddAltRoundedIcon from '@mui/icons-material/PersonAddAltRounded';
import { useAuth } from '../context/useAuth';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import AuthPageFrame from '../components/auth/AuthPageFrame';
import { useI18n } from '../i18n/useI18n';

/**
 * Registration page that creates a session and routes into onboarding.
 */
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
        <AuthPageFrame title={t('auth.createAccount')} subtitle={t('auth.registerSubtitle')} onSubmit={handleSubmit}>
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
                <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={isSubmitting}
                    startIcon={<PersonAddAltRoundedIcon />}
                >
                    {isSubmitting ? t('auth.creatingAccount') : t('auth.register')}
                </Button>
                <Typography variant="body2">
                    {t('auth.haveAccountPrompt')}{' '}
                    <Link component={RouterLink} to="/login">
                        {t('auth.login')}
                    </Link>
                </Typography>
            </Box>
        </AuthPageFrame>
    );
};

export default Register;
