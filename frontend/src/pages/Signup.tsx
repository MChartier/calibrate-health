import { useState } from 'react';
import { Avatar, Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { useAuth } from '../context/AuthContext';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

export default function Signup() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signup(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <Card sx={{ maxWidth: 420, width: '100%', boxShadow: 4 }}>
        <CardContent>
          <Stack spacing={2} component="form" onSubmit={handleSubmit}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                <PersonAddIcon />
              </Avatar>
              <Typography variant="h5">Create your account</Typography>
            </Stack>
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required fullWidth />
            <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required fullWidth />
            {error && <Typography color="error">{error}</Typography>}
            <Button type="submit" variant="contained" disabled={loading} size="large">
              {loading ? 'Signing up...' : 'Sign up'}
            </Button>
            <Typography variant="body2">
              Already have an account?{' '}
              <RouterLink to="/login" style={{ color: '#0f766e', textDecoration: 'none', fontWeight: 600 }}>
                Sign in
              </RouterLink>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
