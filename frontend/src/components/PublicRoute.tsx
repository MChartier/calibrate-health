import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../context/useAuth';

/**
 * PublicRoute
 *
 * Guard for routes intended for unauthenticated users (e.g., login/register).
 * When a session exists, redirect into the app so the login page can't be reached
 * from the browser/PWA back-stack after signing in.
 */
const PublicRoute: React.FC = () => {
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

    return <Outlet />;
};

export default PublicRoute;

