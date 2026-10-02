/**
 * Startup order in `src/main/index.ts`: the crash policy first, then the single-instance
 * lock, and only in the instance that holds it, after `ready`, the log files, the database,
 * the container, IPC, the scheduler and the window. A losing instance quits without
 * touching the database; a failed start goes to the crash policy.
 */

import { EventEmitter } from 'events';
import path from 'path';

const mockOrder: string[] = [];
const mockState = { hasLock: true, openDatabaseError: null as Error | null };
const mockCrashPolicy = { markReady: jest.fn(), failStartup: jest.fn() };

jest.mock('electron', () => {
  const { EventEmitter: Emitter } = jest.requireActual('events');
  const app = Object.assign(new Emitter(), {
    isPackaged: false,
    requestSingleInstanceLock: jest.fn(() => {
      mockOrder.push('requestSingleInstanceLock');
      return mockState.hasLock;
    }),
    whenReady: jest.fn(() => Promise.resolve()),
    getPath: jest.fn(() => '/user-data'),
    getLoginItemSettings: jest.fn(() => ({ wasOpenedAsHidden: false })),
    quit: jest.fn(),
    exit: jest.fn(),
  });
  return { app, dialog: { showErrorBox: jest.fn() } };
});

jest.mock('@main/app/crash-policy', () => ({
  installCrashPolicy: jest.fn(() => {
    mockOrder.push('installCrashPolicy');
    return mockCrashPolicy;
  }),
}));

jest.mock('@main/utils/logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return {
    logger: { ...log, child: () => log },
    initFileLogging: jest.fn((dir: string) => {
      mockOrder.push(`initFileLogging ${dir}`);
      return dir;
    }),
  };
});

jest.mock('@main/database/connection', () => ({
  openDatabase: jest.fn((file: string) => {
    mockOrder.push(`openDatabase ${file}`);
    if (mockState.openDatabaseError) throw mockState.openDatabaseError;
    return { fake: 'db' };
  }),
}));

jest.mock('@main/app/container', () => ({
  createContainer: jest.fn(() => {
    mockOrder.push('createContainer');
    return {
      profile: {
        ensureLocalProfile: () => mockOrder.push('ensureLocalProfile'),
        requireUserId: () => 1,
      },
      trustedWebContents: { isTrusted: () => true },
      scheduler: { start: () => mockOrder.push('scheduler.start') },
      autoUpdater: { scheduleUpdateCheck: jest.fn() },
      notificationService: { notifyError: jest.fn() },
      dispose: jest.fn(),
    };
  }),
}));

jest.mock('@main/ipc', () => ({
  registerIpcHandlers: jest.fn(() => mockOrder.push('registerIpcHandlers')),
}));

jest.mock('@main/app/main-window', () => {
  const { EventEmitter: Emitter } = jest.requireActual('events');
  return {
    createMainWindow: jest.fn(() => {
      mockOrder.push('createMainWindow');
      return Object.assign(new Emitter(), {
        isDestroyed: () => false,
        isMinimized: () => false,
        restore: jest.fn(),
        show: jest.fn(),
        focus: jest.fn(),
      });
    }),
    denyWebviews: jest.fn(),
  };
});

const { app } = jest.requireMock('electron') as { app: EventEmitter & { quit: jest.Mock } };

/** Loads `src/main/index.ts` afresh and lets its `whenReady().then(start)` chain run. */
async function launch(): Promise<void> {
  jest.isolateModules(() => {
    require('@main/index');
  });
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  mockOrder.length = 0;
  mockState.hasLock = true;
  mockState.openDatabaseError = null;
  mockCrashPolicy.markReady.mockClear();
  mockCrashPolicy.failStartup.mockClear();
  app.removeAllListeners();
  app.quit.mockClear();
});

describe('main process startup', () => {
  it('takes the single-instance lock before opening the database, then starts in order', async () => {
    await launch();

    expect(mockOrder).toEqual([
      'installCrashPolicy',
      'requestSingleInstanceLock',
      `initFileLogging ${path.join('/user-data', 'logs')}`,
      `openDatabase ${path.join('/user-data', 'parkstay.db')}`,
      'createContainer',
      'ensureLocalProfile',
      'registerIpcHandlers',
      'scheduler.start',
      'createMainWindow',
    ]);
    expect(mockCrashPolicy.markReady).toHaveBeenCalledTimes(1);
    expect(mockCrashPolicy.failStartup).not.toHaveBeenCalled();
    expect(app.listenerCount('second-instance')).toBe(1);
  });

  it('a second instance quits without opening the database or waiting for ready', async () => {
    mockState.hasLock = false;

    await launch();

    expect(mockOrder).toEqual(['installCrashPolicy', 'requestSingleInstanceLock']);
    expect(app.quit).toHaveBeenCalledTimes(1);
    expect(app.listenerCount('window-all-closed')).toBe(0);
  });

  it('a failed start is handed to the crash policy (error box, exit 1) and never marked ready', async () => {
    const error = new Error('database is locked');
    mockState.openDatabaseError = error;

    await launch();

    expect(mockCrashPolicy.failStartup).toHaveBeenCalledWith(error);
    expect(mockCrashPolicy.markReady).not.toHaveBeenCalled();
    expect(mockOrder).not.toContain('createMainWindow');
  });
});
