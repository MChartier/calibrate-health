import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { CircularProgress, Box, Alert } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const ProtectedRoute: React.FC = () => {
    const { user, isLoading } = useAuth();
    const location = useLocation();
    const isOnboardingRoute = location.pathname.startsWith('/onboarding');

    const profileQuery = useQuery({
        queryKey: ['profile'],
        queryFn: async () => {
            const res = await axios.get('/api/user/profile');
            return res.data;
        },
        enabled: !!user && !isOnboardingRoute && !isLoading
    });

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!user) {
        console.log('Redirecting to login...');
        return <Navigate to="/login" replace />;
    }

    if (!isOnboardingRoute) {
        if (profileQuery.isLoading) {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                    <CircularProgress />
                </Box>
            );
        }

        if (profileQuery.isError) {
            return (
                <Box sx={{ maxWidth: 480, mx: 'auto', mt: 4 }}>
                    <Alert severity="error">Unable to load profile. Please try again.</Alert>
                </Box>
            );
        }

        const missing = profileQuery.data?.calorieSummary?.missing ?? [];
        const hasGoal = profileQuery.data?.goal_daily_deficit !== null && profileQuery.data?.goal_daily_deficit !== undefined;
        const needsOnboarding = missing.length > 0 || !hasGoal;
        if (needsOnboarding) {
            return <Navigate to="/onboarding" replace />;
        }
    }

    return <Outlet />;
};

export default ProtectedRoute;
