/**
 * Jest setup file
 * Runs before all tests
 */

import '@testing-library/jest-dom';

// Set test environment
process.env.NODE_ENV = 'test';

// Mock Electron modules
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn((path: string) => {
      if (path === 'userData') {
        return './test-data';
      }
      return './test-app';
    }),
    getAppPath: jest.fn(() => './'),
    on: jest.fn(),
    quit: jest.fn(),
  },
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
    removeHandler: jest.fn(),
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn(),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    on: jest.fn(),
    webContents: {
      openDevTools: jest.fn(),
      on: jest.fn(),
    },
  })),
  Notification: jest.fn().mockImplementation((options: any) => ({
    show: jest.fn(),
    on: jest.fn(),
    ...options,
  })),
}));

// Mock node-machine-id
jest.mock('node-machine-id', () => ({
  machineIdSync: jest.fn(() => 'test-machine-id-12345'),
}));

// Mock winston logger
jest.mock('../src/main/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    destroy: jest.fn(),
  })),
  validate: jest.fn(() => true),
}));

// Increase timeout for integration tests
jest.setTimeout(30000);

// Clean up after all tests
afterAll(() => {
  // Clean up any test databases, files, etc.
});
