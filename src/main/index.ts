/**
 * Electron Main Process Entry Point
 *
 * The order matters:
 * 1. The crash policy is installed first, so a failed start shows an error box and exits.
 * 2. `bootstrapShell`: userData becomes `<appData>/WA Stay` before anything uses it, then
 *    the AppUserModelId (Windows), then the single-instance lock, which lives in userData.
 *    The lock is taken before any database or scheduler work. A second instance hands over
 *    to the first (which brings its window to the front) and quits.
 * 3. After `ready`: log files under userData, the first-run copy of a v1.x install
 *    (`migration/legacy-install.ts`), the database, the container, the IPC handlers, the
 *    scheduler and the main window. From then on errors are logged and survived.
 *
 * The container's SecretVault uses `safeStorage`, whose Windows key lives in userData's
 * `Local State`: the final userData path is set before `ready`, and the legacy data is
 * copied before `createContainer` (architecture-notes §12.23).
 */

import { app, BrowserWindow, dialog, safeStorage, session } from 'electron';
import path from 'path';
import { openDatabase } from './database/connection';
import { bootstrapShell } from './app/bootstrap';
import { createContainer, AppContainer } from './app/container';
import { installCrashPolicy } from './app/crash-policy';
import { currentLaunchTarget, replaceLegacyLoginItems } from './app/login-item';
import { createMainWindow, denyWebviews } from './app/main-window';
import { getBrandIconPath } from './app/paths';
import { installQuitHold } from './app/quit-hold';
import { createAppUrlMatcher, resolveRendererEntry } from './app/renderer-entry';
import { HIDDEN_ARG } from './app/single-instance';
import { registerIpcHandlers } from './ipc';
import { createSenderGuard } from './ipc/sender-guard';
import {
  createLegacyInstallDeps,
  finishLegacyInstall,
  migrateLegacyInstall,
} from './migration/legacy-install';
import { startFixtureMode } from './testing';
import { initFileLogging, logger } from './utils/logger';

const crashPolicy = installCrashPolicy({ process, app, dialog, log: logger });

// userData (<appData>/WA Stay, then the test-only override when running from source), the
// AppUserModelId, then the single-instance lock
const { paths, testHooks, instance } = bootstrapShell(app, {
  platform: process.platform,
  execPath: process.execPath,
  log: logger,
  // e.g. macOS after the window was closed; during startup the request waits for the window
  requestWindow: () => {
    if (container && mainWindow === null) createWindow(false);
  },
});

// Where the renderer is loaded from. The IPC sender guard trusts exactly this origin.
const rendererEntry = resolveRendererEntry(
  process.env,
  path.join(__dirname, '../../../dist/renderer/index.html'),
  app.isPackaged
);

// Global references
let container: AppContainer | null = null;
let mainWindow: BrowserWindow | null = null;

/**
 * Detect if app was launched at login and should start hidden
 */
function isHiddenLaunch(): boolean {
  if (process.argv.includes(HIDDEN_ARG)) return true;
  if (process.platform === 'darwin') {
    const loginSettings = app.getLoginItemSettings();
    if (loginSettings.wasOpenedAsHidden) return true;
  }
  return false;
}

/**
 * Create the main window. Only the first window of a login launch starts hidden.
 */
function createWindow(startHidden: boolean): void {
  if (!container) return;

  const window = createMainWindow({
    entry: rendererEntry,
    // The bundled preload (`npm run build:preload`): dist/preload/, next to dist/main/
    preloadPath: path.join(__dirname, '../../preload/index.js'),
    trustedWebContents: container.trustedWebContents,
    startHidden,
    // A packaged Windows or macOS window shows the executable's own icon
    icon: process.platform === 'linux' || !app.isPackaged ? getBrandIconPath() : undefined,
  });
  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow !== window) return;
    mainWindow = null;
    instance.attachWindow(null);
  });
  // Brings the window forward if a second launch arrived during startup
  instance.attachWindow(window);

  // Check for updates once the window exists (results arrive as updater:* events)
  container.autoUpdater.scheduleUpdateCheck();
}

/**
 * Initialize logging, database and services, then open the window
 */
async function start(): Promise<void> {
  const logsDir = initFileLogging(path.join(paths.userData, 'logs'));
  logger.info('Initializing application...');

  // Test-only network-free mode (WA_STAY_E2E_FIXTURES_DIR), before anything can send a request
  const fixtureMode = startFixtureMode(testHooks, {
    app,
    session,
    userDataDir: paths.userData,
    log: logger,
  });

  // First start after an upgrade from v1.x: copy its data into the WA Stay data folder
  const migration = await migrateLegacyInstall(
    paths,
    createLegacyInstallDeps({ dialog, appVersion: app.getVersion() })
  );
  if (migration.outcome === 'quit') {
    logger.info('Quitting: the legacy data could not be copied');
    app.quit();
    return;
  }

  // Open and migrate the database
  const db = openDatabase(paths.dbPath);

  // Build every service once, then make sure the local profile row exists
  // Builds the SecretVault and migrates v1.x secrets into it: its first use of safeStorage
  const ready = createContainer({
    db,
    logsDir,
    userDataDir: paths.userData,
    safeStorage,
    isReady: () => app.isReady(),
    fixtureMode,
  });
  container = ready;
  ready.profile.ensureLocalProfile();

  // After a copy made in this start: the welcome notice and launch at login under WA Stay
  finishLegacyInstall(migration, {
    notifications: ready.repositories.notifications,
    userId: ready.profile.requireUserId(),
    launchOnStartup: ready.repositories.settings.getValue<boolean>('launchOnStartup') === true,
    replaceLoginItems: (launchOnStartup) =>
      replaceLegacyLoginItems(launchOnStartup, { ...currentLaunchTarget(), log: logger }),
    logger,
  });

  const trusted = ready.trustedWebContents;
  registerIpcHandlers(ready, {
    isTrustedSender: createSenderGuard({
      isTrustedWebContents: (id) => trusted.isTrusted(id),
      isAppUrl: createAppUrlMatcher(rendererEntry),
    }),
  });

  ready.scheduler.start();
  createWindow(isHiddenLaunch());

  // From here on an error is logged and survived; the user hears about it (throttled), but
  // not once the quit has started: the database is closed then.
  crashPolicy.markReady((error) => {
    if (container !== ready) return;
    ready.notificationService.notifyError(ready.profile.requireUserId(), error, 'Unexpected error');
  });

  logger.info('Application initialized successfully');
}

if (instance.isPrimary) {
  denyWebviews(app);

  app
    .whenReady()
    .then(start)
    .catch((error: unknown) => crashPolicy.failStartup(error));

  /**
   * All windows closed event
   */
  app.on('window-all-closed', () => {
    // On macOS, keep app running until user quits explicitly
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  /**
   * Activate event (macOS)
   */
  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (container && mainWindow === null) {
      createWindow(false);
    }
  });

  /**
   * Quit. The first `before-quit` hides the windows, disposes the container and holds the
   * quit until the providers have closed their browsers (bounded); see `app/quit-hold.ts`.
   */
  installQuitHold({
    app,
    windows: () => BrowserWindow.getAllWindows(),
    shutDown: () => {
      const closing = container;
      if (!closing) return null;
      container = null;
      logger.info('Application shutting down...');
      // Cuts the renderer off, stops the scheduler, disposes the providers (ParkStay's queue
      // gate with them) and closes the database; resolves once every browser has closed
      return closing.dispose();
    },
    log: logger,
  });
}
