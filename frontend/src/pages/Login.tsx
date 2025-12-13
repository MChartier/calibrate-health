import React, { useState } from 'react';
import { Typography, Box, TextField, Button, Alert, Link } from '@mui/material';
import { useAuth } from '../context/useAuth';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await login(email, password);
            navigate('/dashboard');
        } catch {
            setError('Invalid credentials');
        }
    };

    return (
        <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 400, mx: 'auto', mt: 4 }}>
            <Typography variant="h4" gutterBottom>Login</Typography>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <TextField
                label="Email"
                fullWidth
                margin="normal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
                label="Password"
                type="password"
                fullWidth
                margin="normal"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>Login</Button>
            <Typography variant="body2" sx={{ mt: 2 }}>
                Don&apos;t have an account?{' '}
                <Link component={RouterLink} to="/register">
                    Register
                </Link>
            </Typography>
        </Box>
    );
};

export default Login;
