/**
 * Electron Main Process Entry Point
 *
 * The order matters:
 * 1. The crash policy is installed first, so a failed start shows an error box and exits.
 * 2. The single-instance lock is taken before any database or scheduler work. A second
 *    instance hands over to the first (which brings its window to the front) and quits.
 * 3. After `ready`: log files under userData, the database, the container, the IPC handlers,
 *    the scheduler and the main window. From then on errors are logged and survived.
 *
 * The container's SecretVault uses `safeStorage`, whose Windows key lives in userData's
 * `Local State`: the final userData path must be set before `ready` (B3), and any legacy
 * data folder copied before `createContainer` (architecture-notes §12.23).
 */

import { app, BrowserWindow, dialog, safeStorage } from 'electron';
import path from 'path';
import { openDatabase } from './database/connection';
import { createContainer, AppContainer } from './app/container';
import { installCrashPolicy } from './app/crash-policy';
import { createMainWindow, denyWebviews } from './app/main-window';
import { createAppUrlMatcher, resolveRendererEntry } from './app/renderer-entry';
import { acquireSingleInstance, HIDDEN_ARG } from './app/single-instance';
import { registerIpcHandlers } from './ipc';
import { createSenderGuard } from './ipc/sender-guard';
import { initFileLogging, logger } from './utils/logger';

const crashPolicy = installCrashPolicy({ process, app, dialog, log: logger });

const instance = acquireSingleInstance(app, {
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

/** The longest a quit waits for providers to close their browsers (each takes at most 5 s). */
const QUIT_GRACE_MS = 6_000;

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
  const userData = app.getPath('userData');
  const logsDir = initFileLogging(path.join(userData, 'logs'));
  logger.info('Initializing application...');

  // Open and migrate the database (B3 moves it to the WA Stay data folder)
  const db = openDatabase(path.join(userData, 'parkstay.db'));

  // Build every service once, then make sure the local profile row exists
  // Builds the SecretVault and migrates v1.x secrets into it: its first use of safeStorage
  const ready = createContainer({
    db,
    logsDir,
    userDataDir: userData,
    safeStorage,
    isReady: () => app.isReady(),
  });
  container = ready;
  ready.profile.ensureLocalProfile();

  const trusted = ready.trustedWebContents;
  registerIpcHandlers(ready, {
    isTrustedSender: createSenderGuard({
      isTrustedWebContents: (id) => trusted.isTrusted(id),
      isAppUrl: createAppUrlMatcher(rendererEntry),
    }),
  });

  ready.scheduler.start();
  createWindow(isHiddenLaunch());

  // From here on an error is logged and survived; the user hears about it (throttled)
  crashPolicy.markReady((error) =>
    ready.notificationService.notifyError(ready.profile.requireUserId(), error, 'Unexpected error')
  );

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
   * Before quit event. The first one disposes the container and holds the quit until the
   * providers have closed their browsers (bounded), so a browser profile is flushed rather
   * than killed with the app; then it quits again, and the second one lets the quit through.
   */
  app.on('before-quit', (event) => {
    if (!container) return;
    logger.info('Application shutting down...');

    // Stops the scheduler, disposes the providers, destroys the queue service and closes the database
    const disposed = container.dispose();
    container = null;

    event.preventDefault();
    const grace = new Promise<void>((resolve) => setTimeout(resolve, QUIT_GRACE_MS));
    void Promise.race([disposed, grace]).then(() => {
      logger.info('Application shut down successfully');
      app.quit();
    });
  });
}
