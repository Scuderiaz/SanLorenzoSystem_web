import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Common/ToastContainer';
import { initOfflineDB } from './config/database';
import { syncService } from './services/api';
import { canReachBackend } from './utils/backendAvailability';
import Login from './pages/login/Login';
import AssessorDashboard from './pages/assessor_admin/Dashboard';
import AccountManagement from './pages/assessor_admin/AccountManagement';
import Settings from './pages/assessor_admin/Settings';
import Maintenance from './pages/assessor_admin/Maintenance';
import Reports from './pages/assessor_admin/Reports';
import CloseDay from './pages/assessor_admin/CloseDay';
import BillingDashboard from './pages/billing_officer/Dashboard';
import BillingConsumers from './pages/billing_officer/Consumers';
import MeterReading from './pages/billing_officer/MeterReading';
import GenerateBills from './pages/billing_officer/GenerateBills';
import BillingLedger from './pages/billing_officer/Ledger';
import BillingReports from './pages/billing_officer/Reports';
import PendingApplications from './pages/shared/PendingApplications';
import TreasurerDashboard from './pages/treasurer/Dashboard';
import ProcessPayment from './pages/treasurer/ProcessPayment';
import TreasurerLedger from './pages/treasurer/Ledger';
import ForgotPassword from './pages/login/ForgotPassword';
import SignUp from './pages/login/SignUp';
import AuthCallback from './pages/login/AuthCallback';
import LandingPage from './pages/landing/LandingPage';
import ConsumerMain from './pages/consumer/ConsumerMain';
import ConsumerProfile from './pages/consumer/ConsumerProfile';
import './App.css';
import PipelineMap from './pages/assessor_admin/PipelineMap';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return null; // Stay on the current path while checking session
  }
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const RoleDashboard: React.FC = () => {
  const { user } = useAuth();
  if (user?.role_id === 1) return <AssessorDashboard />;
  if (user?.role_id === 2) return <BillingDashboard />;
  if (user?.role_id === 4) return <TreasurerDashboard />;
  if (user?.role_id === 3) return <Navigate to="/meter-reading" />;
  return <AssessorDashboard />;
};

const RoleLedger: React.FC = () => {
  const { user } = useAuth();
  if (user?.role_id === 4) return <TreasurerLedger />;
  return <BillingLedger />;
};

const RoleReports: React.FC = () => {
  const { user } = useAuth();
  if (user?.role_id === 2) return <BillingReports />;
  return <Reports />;
};

const RoleConsumers: React.FC = () => {
  const { user } = useAuth();
  if (user?.role_id === 2 || user?.role_id === 3) return <BillingConsumers />;
  return <Navigate to="/accounts" />;
};

const AppContent: React.FC = () => {
  const { isOnline } = useAuth();

  useEffect(() => {
    initOfflineDB().catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const attemptSync = async () => {
      const backendAvailable = await canReachBackend(true);
      if (!cancelled && backendAvailable) {
        syncService.syncOfflineData().catch(console.error);
      }
    };

    attemptSync().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  return (
    <Routes>
      <Route path="/pipeline-map" element={<ProtectedRoute><PipelineMap /></ProtectedRoute>} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route
        path="/consumer"
        element={
          <ProtectedRoute>
            <ConsumerMain />
          </ProtectedRoute>
        }
      />
      <Route
        path="/consumer/profile"
        element={
          <ProtectedRoute>
            <ConsumerProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <RoleDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounts"
        element={
          <ProtectedRoute>
            <AccountManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/applications"
        element={
          <ProtectedRoute>
            <PendingApplications />
          </ProtectedRoute>
        }
      />
      <Route
        path="/consumers"
        element={
          <ProtectedRoute>
            <RoleConsumers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/maintenance"
        element={
          <ProtectedRoute>
            <Maintenance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <RoleReports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/close-day"
        element={
          <ProtectedRoute>
            <CloseDay />
          </ProtectedRoute>
        }
      />
      <Route
        path="/meter-reading"
        element={
          <ProtectedRoute>
            <MeterReading />
          </ProtectedRoute>
        }
      />
      <Route
        path="/generate-bills"
        element={
          <ProtectedRoute>
            <GenerateBills />
          </ProtectedRoute>
        }
      />
      <Route
        path="/ledger"
        element={
          <ProtectedRoute>
            <RoleLedger />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <ProcessPayment />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<LandingPage />} />
    </Routes>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
