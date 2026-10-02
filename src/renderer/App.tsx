/**
 * Main App Component
 * Handles routing and layout
 */

import React, { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BookingsList from './pages/Bookings/BookingsList';
import BookingDetail from './pages/Bookings/BookingDetail';
import WatchesPage from './pages/Watches';
import CreateWatch from './pages/Watches/CreateWatch';
import EditWatch from './pages/Watches/EditWatch';
import WatchDetail from './pages/Watches/WatchDetail';
import SiteSniperPage from './pages/SiteSniper';
import CreateSiteSnipe from './pages/SiteSniper/CreateSiteSnipe';
import Settings from './pages/Settings';
import ErrorBoundary from './components/ErrorBoundary';
import { Spinner } from './components/ui';
import UpdateNotification from './components/UpdateNotification';

// Dev-only design preview (#/__design). The ternary lets Vite drop the page and its chunk
// from production builds. D3 moves it into the route table.
const DesignPreviewPage = import.meta.env.DEV
  ? lazy(() => import('./features/design-preview/DesignPreviewPage'))
  : null;

const GatedApp: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await window.api.auth.validateSession();
      setIsAuthenticated(response.data || false);
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await window.api.auth.deleteCredentials();
      setIsAuthenticated(false);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <Login onLogin={handleLogin} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <MainLayout onLogout={handleLogout}>
        <UpdateNotification />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bookings" element={<BookingsList />} />
          <Route path="/bookings/:id" element={<BookingDetail />} />
          <Route path="/watches" element={<WatchesPage />} />
          <Route path="/watches/create" element={<CreateWatch />} />
          <Route path="/watches/:id" element={<WatchDetail />} />
          <Route path="/watches/:id/edit" element={<EditWatch />} />
          <Route path="/site-sniper" element={<SiteSniperPage />} />
          <Route path="/site-sniper/create" element={<CreateSiteSnipe />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </ErrorBoundary>
  );
};

const App: React.FC = () => (
  <Routes>
    {DesignPreviewPage && (
      // Registered outside the login gate so the preview needs no ParkStay account.
      <Route
        path="/__design"
        element={
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center">
                <Spinner size="lg" />
              </div>
            }
          >
            <DesignPreviewPage />
          </Suspense>
        }
      />
    )}
    <Route path="*" element={<GatedApp />} />
  </Routes>
);

export default App;
