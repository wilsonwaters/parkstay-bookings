/**
 * React Application Entry Point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import App from './App';
import { AnnouncerProvider, Portal, ToastProvider, ToastViewport } from './components/ui';
// Bundled fonts (no CDN): Figtree for UI, Fraunces (opsz + wght axes) for display.
import '@fontsource-variable/figtree';
import '@fontsource-variable/fraunces/opsz.css';
import './styles/index.css';

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Render app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <QueryClientProvider client={queryClient}>
        {/* One icon style app-wide (D3 moves this into app/AppProviders.tsx). */}
        <LucideProvider strokeWidth={1.75} size={20}>
          {/* App-wide toasts and live announcements (D3 moves these into app/AppProviders.tsx
              and puts the toast viewport in the tray). */}
          <ToastProvider>
            <AnnouncerProvider>
              <App />
              {/* Floating surfaces live outside #root: a modal makes #root inert, and toasts
                  must stay audible and clickable above its scrim (z-toast > z-overlay). */}
              <Portal>
                <div className="pointer-events-none fixed bottom-4 left-1/2 z-toast -translate-x-1/2">
                  <ToastViewport />
                </div>
              </Portal>
            </AnnouncerProvider>
          </ToastProvider>
        </LucideProvider>
      </QueryClientProvider>
    </HashRouter>
  </React.StrictMode>
);
