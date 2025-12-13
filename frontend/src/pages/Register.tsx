import React, { useState } from 'react';
import { Typography, Box, TextField, Button, Alert, Link } from '@mui/material';
import { useAuth } from '../context/useAuth';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

const Register: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { register } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await register(email, password);
            navigate('/dashboard');
        } catch {
            setError('Registration failed');
        }
    };

    return (
        <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 400, mx: 'auto', mt: 4 }}>
            <Typography variant="h4" gutterBottom>Register</Typography>
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
            <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>Register</Button>
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
