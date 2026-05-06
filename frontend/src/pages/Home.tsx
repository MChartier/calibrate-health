import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/useAuth';

const HOME_SIGNED_IN_BREAKPOINT = 'md'; // Match the app shell mode: desktop opens the combined workspace, mobile opens the Today tab.

/**
 * Public index route that sends guests to the focused sign-in entry point.
 */
const Home: React.FC = () => {
    const { user, isLoading } = useAuth();
    const theme = useTheme();
    const isDesktopWorkspace = useMediaQuery(theme.breakpoints.up(HOME_SIGNED_IN_BREAKPOINT));

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (user) {
        return <Navigate to={isDesktopWorkspace ? '/dashboard' : '/log'} replace />;
    }

    return <Navigate to="/login" replace />;
};

export default Home;
