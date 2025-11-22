import React from 'react';
import { AppBar, Toolbar, Typography, Button, Container, Box } from '@mui/material';
import { Outlet, Link as RouterLink } from 'react-router-dom';

const Layout: React.FC = () => {
    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Fitness App
                    </Typography>
                    <Button color="inherit" component={RouterLink} to="/login">Login</Button>
                    <Button color="inherit" component={RouterLink} to="/register">Register</Button>
                    <Button color="inherit" component={RouterLink} to="/dashboard">Dashboard</Button>
                    <Button color="inherit" component={RouterLink} to="/settings">Settings</Button>
                </Toolbar>
            </AppBar>
            <Container maxWidth="lg">
                <Box sx={{ my: 4 }}>
                    <Outlet />
                </Box>
            </Container>
        </>
    );
};

export default Layout;
