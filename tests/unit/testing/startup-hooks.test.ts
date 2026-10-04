/**
 * How `src/main/index.ts` applies the test-only hooks: the userData override before the
 * single-instance lock (which lives in userData), fixture mode after `ready` and before the
 * container, which then serves providers from fixtures. A packaged app does none of it, even
 * with every variable set.
 */

import { EventEmitter } from 'events';
import path from 'path';

const mockOrder: string[] = [];
const mockState = {
  userData: '/user-data',
  containerOptions: null as null | Record<string, unknown>,
};

jest.mock('electron', () => {
  const { EventEmitter: Emitter } = jest.requireActual('events');
  const app = Object.assign(new Emitter(), {
    isPackaged: false,
    requestSingleInstanceLock: jest.fn(() => {
      mockOrder.push('requestSingleInstanceLock');
      return true;
    }),
    whenReady: jest.fn(() => Promise.resolve()),
    getPath: jest.fn(() => mockState.userData),
    setPath: jest.fn((name: string, value: string) => {
      mockOrder.push(`setPath ${name} ${value}`);
      mockState.userData = value;
    }),
    isReady: jest.fn(() => true),
    getLoginItemSettings: jest.fn(() => ({ wasOpenedAsHidden: false })),
    quit: jest.fn(),
    exit: jest.fn(),
  });
  const defaultSession = {
    webRequest: {
      onBeforeRequest: jest.fn(() => mockOrder.push('defaultSession.onBeforeRequest')),
    },
  };
  return {
    app,
    dialog: { showErrorBox: jest.fn() },
    safeStorage: {},
    session: { defaultSession },
  };
});

jest.mock('@main/app/crash-policy', () => ({
  installCrashPolicy: jest.fn(() => ({ markReady: jest.fn(), failStartup: jest.fn() })),
}));

jest.mock('@main/utils/logger', () => {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return {
    logger: { ...log, child: () => log },
    initFileLogging: jest.fn((dir: string) => dir),
  };
});

jest.mock('@main/database/connection', () => ({
  openDatabase: jest.fn((file: string) => {
    mockOrder.push(`openDatabase ${file}`);
    return {};
  }),
}));

jest.mock('@main/app/container', () => ({
  createContainer: jest.fn((options: Record<string, unknown>) => {
    mockOrder.push('createContainer');
    mockState.containerOptions = options;
    return {
      profile: { ensureLocalProfile: jest.fn(), requireUserId: () => 1 },
      trustedWebContents: { isTrusted: () => true },
      scheduler: { start: jest.fn() },
      autoUpdater: { scheduleUpdateCheck: jest.fn() },
      notificationService: { notifyError: jest.fn() },
      dispose: jest.fn(),
    };
  }),
}));

jest.mock('@main/ipc', () => ({ registerIpcHandlers: jest.fn() }));

jest.mock('@main/app/main-window', () => {
  const { EventEmitter: Emitter } = jest.requireActual('events');
  return {
    createMainWindow: jest.fn(() =>
      Object.assign(new Emitter(), { isDestroyed: () => false, isMinimized: () => false })
    ),
    denyWebviews: jest.fn(),
  };
});

const electron = jest.requireMock('electron') as {
  app: EventEmitter & { isPackaged: boolean; setPath: jest.Mock };
  session: { defaultSession: { webRequest: { onBeforeRequest: jest.Mock } } };
};

const HOOK_VARS = {
  WA_STAY_USER_DATA_DIR: path.resolve('/tmp/wa-stay-e2e-user-data'),
  WA_STAY_E2E_FIXTURES_DIR: path.resolve('/tmp/wa-stay-e2e-fixtures'),
  WA_STAY_E2E_ALLOW_HOSTS: '',
};
const savedEnv = { ...process.env };

async function launch(): Promise<void> {
  jest.isolateModules(() => {
    require('@main/index');
  });
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  mockOrder.length = 0;
  mockState.userData = '/user-data';
  mockState.containerOptions = null;
  electron.app.isPackaged = false;
  electron.app.removeAllListeners();
  jest.clearAllMocks();
  Object.assign(process.env, HOOK_VARS);
});

afterEach(() => {
  for (const name of Object.keys(HOOK_VARS)) {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  }
});

describe('test-only hooks at startup', () => {
  it('unpackaged: userData is overridden before the lock, and fixture mode is on before the container', async () => {
    await launch();

    const userData = HOOK_VARS.WA_STAY_USER_DATA_DIR;
    expect(mockOrder).toEqual([
      `setPath userData ${userData}`,
      'requestSingleInstanceLock',
      'defaultSession.onBeforeRequest',
      `openDatabase ${path.join(userData, 'parkstay.db')}`,
      'createContainer',
    ]);
    expect(electron.app.listenerCount('session-created')).toBe(1);
    expect(mockState.containerOptions).toMatchObject({
      userDataDir: userData,
      fixtureMode: {
        fixturesDir: HOOK_VARS.WA_STAY_E2E_FIXTURES_DIR,
        logFile: path.join(userData, 'e2e-unexpected-requests.log'),
      },
    });
  });

  it('packaged: no userData override, no network guard and no fixture mode, even with the variables set', async () => {
    electron.app.isPackaged = true;

    await launch();

    expect(electron.app.setPath).not.toHaveBeenCalled();
    expect(electron.session.defaultSession.webRequest.onBeforeRequest).not.toHaveBeenCalled();
    expect(electron.app.listenerCount('session-created')).toBe(0);
    expect(mockOrder).toEqual([
      'requestSingleInstanceLock',
      `openDatabase ${path.join('/user-data', 'parkstay.db')}`,
      'createContainer',
    ]);
    expect(mockState.containerOptions?.fixtureMode).toBeUndefined();
  });
});
