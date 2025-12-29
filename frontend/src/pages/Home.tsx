import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../context/useAuth';
import Landing from './Landing';

/**
 * Home
 *
 * The public index route:
 * - unauthenticated visitors see the marketing landing page
 * - authenticated users are routed directly into the app
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

