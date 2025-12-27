import React, { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../context/useAuth';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';

const Login: React.FC = () => {
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
            navigate('/log');
        } catch {
            setError('Invalid credentials');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AppPage maxWidth={420}>
            <AppCard>
                <Stack component="form" spacing={2} onSubmit={handleSubmit}>
                    <SectionHeader title="Login" />

                    {error && (
                        <Alert severity="error">
                            {error}
                        </Alert>
                    )}

                    <TextField
                        label="Email"
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
                        label="Password"
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
                            {isSubmitting ? 'Logging in…' : 'Login'}
                        </Button>
                        <Typography variant="body2">
                            Don&apos;t have an account?{' '}
                            <Link component={RouterLink} to="/register">
                                Register
                            </Link>
                        </Typography>
                    </Box>
                </Stack>
            </AppCard>
        </AppPage>
    );
};

export default Login;
