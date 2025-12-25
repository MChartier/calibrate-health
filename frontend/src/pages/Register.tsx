import React, { useState } from 'react';
import { Typography, Box, TextField, Button, Alert, Link } from '@mui/material';
import { useAuth } from '../context/useAuth';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

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
        <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 400, mx: 'auto', mt: 4 }}>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
                label="Email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                fullWidth
                margin="normal"
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
                margin="normal"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
            />
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }} disabled={isSubmitting}>
                {isSubmitting ? 'Creating…' : 'Register'}
            </Button>
            <Typography variant="body2" sx={{ mt: 2 }}>
                Already have an account?{' '}
                <Link component={RouterLink} to="/login">
                    Login
                </Link>
            </Typography>
        </Box>
    );
};

export default Register;
