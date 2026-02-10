/**
 * Main App Component
 * Handles routing and layout
 */

import React, { useState, useEffect } from 'react';
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
import SkipTheQueuePage from './pages/SkipTheQueue';
import CreateSTQ from './pages/SkipTheQueue/CreateSTQ';
import Settings from './pages/Settings';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import UpdateNotification from './components/UpdateNotification';

const App: React.FC = () => {
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
    return <LoadingSpinner size="lg" text="Loading..." fullScreen />;
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
          <Route path="/skip-the-queue" element={<SkipTheQueuePage />} />
          <Route path="/skip-the-queue/create" element={<CreateSTQ />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </ErrorBoundary>
  );
};

export default App;
