import { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { Box, LinearProgress } from '@mui/material';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';

const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Log = lazy(() => import('./pages/Log'));
const Goals = lazy(() => import('./pages/Goals'));
const Settings = lazy(() => import('./pages/Settings'));
const Profile = lazy(() => import('./pages/Profile'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const DevDashboard = import.meta.env.DEV ? lazy(() => import('./pages/DevDashboard')) : null;

/**
 * Lightweight page placeholder that keeps the persistent layout chrome visible during route chunk loads.
 */
function RouteLoadingFallback(): ReactElement {
    return (
        <Box sx={{ py: 3 }}>
            <LinearProgress aria-label="Loading page" />
        </Box>
    );
}

/**
 * Wrap route-level lazy pages so each route can split without duplicating Suspense boilerplate.
 */
function renderRouteElement(Page: ComponentType): ReactElement {
    return (
        <Suspense fallback={<RouteLoadingFallback />}>
            <Page />
        </Suspense>
    );
}

function App() {
    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={renderRouteElement(Home)} />
                <Route path="privacy" element={renderRouteElement(PrivacyPolicy)} />
                <Route element={<PublicRoute />}>
                    <Route path="login" element={renderRouteElement(Login)} />
                    <Route path="register" element={renderRouteElement(Register)} />
                </Route>
                {DevDashboard && <Route path="dev" element={renderRouteElement(DevDashboard)} />}

                <Route element={<ProtectedRoute />}>
                    <Route path="onboarding" element={renderRouteElement(Onboarding)} />
                    <Route path="dashboard" element={renderRouteElement(Dashboard)} />
                    <Route path="log" element={renderRouteElement(Log)} />
                    <Route path="goals" element={renderRouteElement(Goals)} />
                    <Route path="history" element={<Navigate to="/goals" replace />} />
                    <Route path="settings" element={renderRouteElement(Settings)} />
                    <Route path="profile" element={renderRouteElement(Profile)} />
                </Route>
            </Route>
        </Routes>
    );
}

export default App;
