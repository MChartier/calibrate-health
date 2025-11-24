import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <Box sx={{ minHeight: '100vh', background: 'radial-gradient(circle at 20% 20%, #e0f2f1, #f5f5f4)' }}>
      <AppBar position="static" color="primary" elevation={0} sx={{ mb: 4 }}>
        <Toolbar>
          <Typography
            variant="h6"
            sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit' }}
            component={RouterLink}
            to="/"
          >
            CalTrack
          </Typography>
          <Button color="inherit" component={RouterLink} to="/">Dashboard</Button>
          <Button color="inherit" component={RouterLink} to="/history">History</Button>
          {user && (
            <Button color="inherit" onClick={handleLogout} sx={{ ml: 2 }}>
              Logout
            </Button>
          )}
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ pb: 6 }}>
        {children}
      </Container>
    </Box>
  );
}
