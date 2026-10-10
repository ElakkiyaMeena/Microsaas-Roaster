import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { createQueryClient, ROUTER_FUTURE_FLAGS } from './lib/queryClient';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

// Public pages
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const OAuthCallbackPage = lazy(() => import('./pages/OAuthCallbackPage'));
const PublicRoastPage = lazy(() => import('./pages/PublicRoastPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Protected pages
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SubmissionsPage = lazy(() => import('./pages/SubmissionsPage'));
const NewSubmissionPage = lazy(() => import('./pages/NewSubmissionPage'));
const SubmissionDetailPage = lazy(() => import('./pages/SubmissionDetailPage'));
const EditSubmissionPage = lazy(() => import('./pages/EditSubmissionPage'));
const GithubRoastPage = lazy(() => import('./pages/GithubRoastPage'));

// Admin pages
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage'));
const AdminShareLinksPage = lazy(() => import('./pages/admin/AdminShareLinksPage'));

const queryClient = createQueryClient();

/** Route table. Exported separately so tests can render it inside a MemoryRouter. */
export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        <Route path="/r/:slug" element={<PublicRoastPage />} />

        {/* Authenticated */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/submissions" element={<SubmissionsPage />} />
          <Route path="/submissions/new" element={<NewSubmissionPage />} />
          <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
          <Route path="/submissions/:id/edit" element={<EditSubmissionPage />} />
          <Route path="/github-roast" element={<GithubRoastPage />} />
        </Route>

        {/* Admin */}
        <Route
          element={
            <ProtectedRoute requireAdmin>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/share-links" element={<AdminShareLinksPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter future={ROUTER_FUTURE_FLAGS}>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
