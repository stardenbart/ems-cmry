import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout/Layout';
import ErrorBoundary from './components/Common/ErrorBoundary';
import Login from './pages/Login';
import RealtimeDevice from './pages/RealtimeDevice';
import DashboardEnergy from './pages/DashboardEnergy';
import DashboardComparison from './pages/DashboardComparison';
import DashboardPower from './pages/DashboardPower';
import AlarmList from './pages/AlarmList';
import AlarmReport from './pages/AlarmReport';
import BasicReport from './pages/BasicReport';
import SettingsDevice from './pages/SettingsDevice';
import SettingsGateway from './pages/SettingsGateway';
import SettingsDataMapping from './pages/SettingsDataMapping';
import SettingsGrouping from './pages/SettingsGrouping';
import SettingsEnergyConversion from './pages/SettingsEnergyConversion';
import SettingsAlarm from './pages/SettingsAlarm';
import SettingsUsers from './pages/SettingsUsers';
import SettingsSMTP from './pages/SettingsSMTP';
import ChangePassword from './pages/ChangePassword';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  return (
    <Layout>
      <ErrorBoundary>{children}</ErrorBoundary>
    </Layout>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />

      {/* Realtime */}
      <Route path="/realtime/device" element={<ProtectedRoute><RealtimeDevice /></ProtectedRoute>} />
      <Route path="/realtime/sld" element={<ProtectedRoute><RealtimeDevice /></ProtectedRoute>} />

      {/* Dashboard - Device */}
      <Route path="/dashboard/energy" element={<ProtectedRoute><DashboardEnergy /></ProtectedRoute>} />
      <Route path="/dashboard/comparison" element={<ProtectedRoute><DashboardComparison /></ProtectedRoute>} />
      <Route path="/dashboard/power" element={<ProtectedRoute><DashboardPower /></ProtectedRoute>} />
      <Route path="/dashboard/pq" element={<ProtectedRoute><DashboardPower /></ProtectedRoute>} />

      {/* Dashboard - Group */}
      <Route path="/dashboard/group/energy" element={<ProtectedRoute><DashboardEnergy /></ProtectedRoute>} />
      <Route path="/dashboard/group/comparison" element={<ProtectedRoute><DashboardComparison /></ProtectedRoute>} />
      <Route path="/dashboard/group/kva" element={<ProtectedRoute><DashboardPower /></ProtectedRoute>} />

      {/* Report */}
      <Route path="/report/basic" element={<ProtectedRoute><BasicReport /></ProtectedRoute>} />
      <Route path="/report/alarm" element={<ProtectedRoute><AlarmReport /></ProtectedRoute>} />

      {/* Alarm */}
      <Route path="/alarm" element={<ProtectedRoute><AlarmList /></ProtectedRoute>} />

      {/* Settings */}
      <Route path="/settings/device" element={<ProtectedRoute><SettingsDevice /></ProtectedRoute>} />
      <Route path="/settings/gateway" element={<ProtectedRoute><SettingsGateway /></ProtectedRoute>} />
      <Route path="/settings/data-mapping" element={<ProtectedRoute><SettingsDataMapping /></ProtectedRoute>} />
      <Route path="/settings/grouping" element={<ProtectedRoute><SettingsGrouping /></ProtectedRoute>} />
      <Route path="/settings/energy-conversion" element={<ProtectedRoute><SettingsEnergyConversion /></ProtectedRoute>} />
      <Route path="/settings/alarm" element={<ProtectedRoute><SettingsAlarm /></ProtectedRoute>} />
      <Route path="/settings/users" element={<ProtectedRoute><SettingsUsers /></ProtectedRoute>} />
      <Route path="/settings/smtp" element={<ProtectedRoute><SettingsSMTP /></ProtectedRoute>} />

      {/* Default */}
      <Route path="/" element={<Navigate to="/realtime/device" />} />
      <Route path="*" element={<Navigate to="/realtime/device" />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;