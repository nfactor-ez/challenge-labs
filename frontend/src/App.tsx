import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { SettingsProvider } from './context/SettingsContext';

// Auth pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';

// Main pages
import { DashboardPage } from './pages/DashboardPage';
import { ChallengePage } from './pages/ChallengePage';
import { ChallengeDetailPage } from './pages/ChallengeDetailPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { PremiumPage } from './pages/PremiumPage';

// Admin pages
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminChallengePage } from './pages/admin/AdminChallengePage';
import { AdminChallengeFormPage } from './pages/admin/AdminChallengeFormPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminCategoriesPage } from './pages/admin/AdminCategoriesPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';

import { LoadingState } from './components/ui';

// ─── Guards ───────────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState message="Authenticating..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <LoadingState message="Checking access..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState message="Loading..." />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// ─── App ──────────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login"    element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      <Route path="/forgot-password" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />

      {/* Protected */}
      <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
      <Route path="/challenges" element={<RequireAuth><ChallengePage /></RequireAuth>} />
      <Route path="/challenges/:id" element={<RequireAuth><ChallengeDetailPage /></RequireAuth>} />
      <Route path="/leaderboard" element={<RequireAuth><LeaderboardPage /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="/premium" element={<RequireAuth><PremiumPage /></RequireAuth>} />

      {/* Admin */}
      <Route path="/admin" element={<RequireAdmin><AdminDashboardPage /></RequireAdmin>} />
      <Route path="/admin/challenges" element={<RequireAdmin><AdminChallengePage /></RequireAdmin>} />
      <Route path="/admin/challenges/new" element={<RequireAdmin><AdminChallengeFormPage /></RequireAdmin>} />
      <Route path="/admin/challenges/:id/edit" element={<RequireAdmin><AdminChallengeFormPage /></RequireAdmin>} />
      <Route path="/admin/users" element={<RequireAdmin><AdminUsersPage /></RequireAdmin>} />
      <Route path="/admin/categories" element={<RequireAdmin><AdminCategoriesPage /></RequireAdmin>} />
      <Route path="/admin/settings" element={<RequireAdmin><AdminSettingsPage /></RequireAdmin>} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <SettingsProvider>
          <AuthProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </AuthProvider>
        </SettingsProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
