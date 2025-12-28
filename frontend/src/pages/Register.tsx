import React, { useState } from 'react';
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { useAuth } from '../context/useAuth';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import AppPage from '../ui/AppPage';
import AppCard from '../ui/AppCard';
import SectionHeader from '../ui/SectionHeader';

const Register: React.FC = () => {
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
            navigate('/onboarding');
        } catch {
            setError('Registration failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AppPage maxWidth="form">
            <AppCard>
                <Stack component="form" spacing={2} onSubmit={handleSubmit}>
                    <SectionHeader title="Create account" />

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
                        autoComplete="new-password"
                        fullWidth
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isSubmitting}
                        required
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <Button type="submit" variant="contained" fullWidth disabled={isSubmitting}>
                            {isSubmitting ? 'Creating…' : 'Register'}
                        </Button>
                        <Typography variant="body2">
                            Already have an account?{' '}
                            <Link component={RouterLink} to="/login">
                                Login
                            </Link>
                        </Typography>
                    </Box>
                </Stack>
            </AppCard>
        </AppPage>
    );
};

export default Register;
