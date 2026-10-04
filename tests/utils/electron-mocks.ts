/**
 * Module factories for the Electron-only dependencies of the composition root, for main
 * tests that build a real container:
 *
 *   jest.mock('electron', () => jest.requireActual('@tests/utils/electron-mocks').electron());
 *   jest.mock('electron-updater', () => jest.requireActual('@tests/utils/electron-mocks').electronUpdater());
 */

import { EventEmitter } from 'events';

export function electron(): Record<string, unknown> {
  return {
    app: {
      getAppPath: () => '/app',
      getPath: () => '/tmp/wa-stay-test',
      getName: () => 'WA Stay',
      getVersion: () => '0.0.0-test',
      isPackaged: false,
      setLoginItemSettings: jest.fn(),
    },
    Notification: jest.fn().mockImplementation(() => ({ on: jest.fn(), show: jest.fn() })),
    shell: { openExternal: jest.fn(), openPath: jest.fn() },
    // The scheduler re-arms its timers on `resume` and `unlock-screen`; a test emits them.
    powerMonitor: new EventEmitter(),
    ipcMain: { handle: jest.fn() },
    session: { fromPartition: jest.fn(() => fakeSession()) },
    // Providers' HTTP clients send through `net.request`; it fails unless a test stubs it.
    net: {
      request: jest.fn(() => {
        throw new Error('net.request is not mocked in this test');
      }),
    },
  };
}

/** A session partition (`session.fromPartition`): providers' HTTP clients are built on it. */
export function fakeSession(): Record<string, unknown> {
  return {
    setUserAgent: jest.fn(),
    cookies: {
      get: jest.fn(() => Promise.resolve([])),
      set: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
    },
  };
}

/** `autoUpdater` is an EventEmitter, so a test can emit `update-available` and the like. */
export function electronUpdater(): Record<string, unknown> {
  const autoUpdater = Object.assign(new EventEmitter(), {
    checkForUpdates: jest.fn(),
    downloadUpdate: jest.fn(),
    quitAndInstall: jest.fn(),
  });
  return { autoUpdater };
}
