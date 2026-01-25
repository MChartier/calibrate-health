import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Log from './pages/Log';
import Goals from './pages/Goals';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import DevDashboard from './pages/DevDashboard';
import PrivacyPolicy from './pages/PrivacyPolicy';

import ProtectedRoute from './components/ProtectedRoute';
import PublicRoute from './components/PublicRoute';

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
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="log" element={<Log />} />
                    <Route path="goals" element={<Goals />} />
                    <Route path="history" element={<Navigate to="/goals" replace />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="profile" element={<Profile />} />
                </Route>
            </Route>
        </Routes>
    );
}

export default App;
