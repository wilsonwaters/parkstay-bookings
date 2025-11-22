import '@testing-library/jest-dom';

// Polyfill setImmediate for jsdom
if (typeof global.setImmediate === 'undefined') {
  global.setImmediate = ((fn: any, ...args: any[]) => setTimeout(fn, 0, ...args)) as any;
}

// Mock window.electron API
global.window = global.window || {};
(global.window as any).electron = {
  // Auth handlers
  auth: {
    storeCredentials: jest.fn(),
    getCredentials: jest.fn(),
    testConnection: jest.fn(),
  },
  // Booking handlers
  booking: {
    getAll: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    importFromEmail: jest.fn(),
  },
  // Watch handlers
  watch: {
    getAll: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    toggleActive: jest.fn(),
  },
  // STQ handlers
  stq: {
    getAll: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    toggleActive: jest.fn(),
  },
  // Notification handlers
  notification: {
    getAll: jest.fn(),
    getUnreadCount: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    delete: jest.fn(),
    onNewNotification: jest.fn(),
  },
  // Settings handlers
  settings: {
    getAll: jest.fn(),
    update: jest.fn(),
    reset: jest.fn(),
  },
  // Gmail handlers
  gmail: {
    authorize: jest.fn(),
    getAuthStatus: jest.fn(),
    revokeAccess: jest.fn(),
  },
};

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
