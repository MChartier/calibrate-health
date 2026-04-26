import React, { type ReactElement } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Log from './pages/Log';
import Goals from './pages/Goals';
import MobileToday from './pages/MobileToday';
import Weight from './pages/Weight';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import DevDashboard from './pages/DevDashboard';
import PrivacyPolicy from './pages/PrivacyPolicy';

import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';

const RESPONSIVE_WORKSPACE_BREAKPOINT = 'md'; // md and wider use the combined Today workspace; narrower screens use focused tabs.

type ResponsiveModeRouteProps = {
    desktopElement: ReactElement;
    mobileElement: ReactElement;
};

/**
 * Switch route content at the same breakpoint where the app changes navigation models.
 */
const ResponsiveModeRoute: React.FC<ResponsiveModeRouteProps> = ({ desktopElement, mobileElement }) => {
    const theme = useTheme();
    const isDesktopWorkspace = useMediaQuery(theme.breakpoints.up(RESPONSIVE_WORKSPACE_BREAKPOINT));
    return isDesktopWorkspace ? desktopElement : mobileElement;
};

/**
 * Redirect between responsive route modes without dropping shortcut/query params.
 */
const RedirectWithSearch: React.FC<{ to: string }> = ({ to }) => {
    const location = useLocation();
    return <Navigate to={`${to}${location.search}`} replace />;
};

function App() {
    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="privacy" element={<PrivacyPolicy />} />
                <Route element={<PublicRoute />}>
                    <Route path="login" element={<Login />} />
                    <Route path="register" element={<Register />} />
                </Route>
                {import.meta.env.DEV && <Route path="dev" element={<DevDashboard />} />}

                <Route element={<ProtectedRoute />}>
                    <Route path="onboarding" element={<Onboarding />} />
                    <Route
                        path="dashboard"
                        element={<ResponsiveModeRoute desktopElement={<Dashboard />} mobileElement={<MobileToday />} />}
                    />
                    <Route
                        path="log"
                        element={<ResponsiveModeRoute desktopElement={<RedirectWithSearch to="/dashboard" />} mobileElement={<Log />} />}
                    />
                    <Route
                        path="weight"
                        element={<ResponsiveModeRoute desktopElement={<RedirectWithSearch to="/dashboard" />} mobileElement={<Weight />} />}
                    />
                    <Route
                        path="goals"
                        element={<Goals />}
                    />
                    <Route path="history" element={<Navigate to="/goals" replace />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="profile" element={<Profile />} />
                </Route>
            </Route>
        </Routes>
    );
}

export default App;
