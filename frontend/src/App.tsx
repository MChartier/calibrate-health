import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Log from './pages/Log';
import History from './pages/History';
import Settings from './pages/Settings';
import Onboarding from './pages/Onboarding';
import DevDashboard from './pages/DevDashboard';

import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/log" replace />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="dev" element={<DevDashboard />} />

        <Route element={<ProtectedRoute />}>
          <Route path="onboarding" element={<Onboarding />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="log" element={<Log />} />
          <Route path="history" element={<History />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;
