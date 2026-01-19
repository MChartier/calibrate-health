import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../context/useAuth';
import Landing from './Landing';

/**
 * Public index route that routes signed-in users to /log and shows landing for guests.
 */
const Home: React.FC = () => {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (user) {
        return <Navigate to="/log" replace />;
    }

    return <Landing />;
};

export default Home;
