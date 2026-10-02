/**
 * Electron Main Process Entry Point
 * Initializes the application, database, services, and window
 */

import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { openDatabase } from './database/connection';
import { createContainer, AppContainer } from './app/container';
import { installCrashPolicy } from './app/crash-policy';
import { createAppUrlMatcher, resolveRendererEntry } from './app/renderer-entry';
import { registerIpcHandlers } from './ipc';
import { createSenderGuard } from './ipc/sender-guard';
import { initFileLogging, logger } from './utils/logger';

// Installed first: a failed start shows an error box and exits; after startup errors are
// logged and survived
const crashPolicy = installCrashPolicy({ process, app, dialog, log: logger });

// Where the renderer is loaded from. The IPC sender guard trusts exactly this origin.
const rendererEntry = resolveRendererEntry(
  process.env,
  path.join(__dirname, '../../../dist/renderer/index.html')
);

/**
 * Detect if app was launched at login and should start hidden
 */
function isHiddenLaunch(): boolean {
  if (process.argv.includes('--hidden')) return true;
  if (process.platform === 'darwin') {
    const loginSettings = app.getLoginItemSettings();
    if (loginSettings.wasOpenedAsHidden) return true;
  }
  return false;
}

// Global references
let container: AppContainer | null = null;
let mainWindow: BrowserWindow | null = null;

/**
 * Create main window
 */
function createWindow(): void {
  const preloadPath = path.resolve(__dirname, '../preload/index.js');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      sandbox: false,
    },
    title: 'ParkStay Bookings',
    show: false, // Don't show until ready
  });

  // Only this window's webContents may call IPC and receive events
  container?.trustedWebContents.register(mainWindow.webContents);

  // Load the app
  if (rendererEntry.kind === 'dev-server') {
    // In development, load from Vite dev server
    mainWindow.loadURL(rendererEntry.url);
    mainWindow.webContents.openDevTools();
    logger.info(`Loading from dev server: ${rendererEntry.url}`);
  } else {
    // In production, load the built files
    mainWindow.loadFile(rendererEntry.path);
    logger.info(`Loading from file: ${rendererEntry.path}`);
  }

  // Show window when ready (unless launched hidden at login)
  mainWindow.once('ready-to-show', () => {
    if (!isHiddenLaunch()) {
      mainWindow?.show();
    } else {
      logger.info('App launched hidden at login — window will not be shown');
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check for updates once the window exists (results arrive as updater:* events)
  container?.autoUpdater.scheduleUpdateCheck();
}

/**
 * Initialize database and services
 */
async function initializeApp(): Promise<void> {
  try {
    const logsDir = initFileLogging(path.join(app.getPath('userData'), 'logs'));
    logger.info('Initializing application...');

    // Open and migrate the database (B3 moves it to the WA Stay data folder)
    const db = openDatabase(path.join(app.getPath('userData'), 'parkstay.db'));

    // Build every service once, then make sure the local profile row exists
    container = createContainer({ db, logsDir });
    container.profile.ensureLocalProfile();

    const trusted = container.trustedWebContents;
    registerIpcHandlers(container, {
      isTrustedSender: createSenderGuard({
        isTrustedWebContents: (id) => trusted.isTrusted(id),
        isAppUrl: createAppUrlMatcher(rendererEntry),
      }),
    });

    container.scheduler.start();

    logger.info('Application initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application:', error);
    throw error;
  }
}

/**
 * App ready event
 */
app.on('ready', async () => {
  try {
    await initializeApp();
    createWindow();
    const ready = container;
    if (!ready) throw new Error('The application did not initialize');
    // From here on an error is logged and survived; the user hears about it (throttled)
    crashPolicy.markReady((error) =>
      ready.notificationService.notifyError(ready.profile.requireUserId(), error, 'Unexpected error')
    );
  } catch (error) {
    crashPolicy.failStartup(error);
  }
});

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
  if (mainWindow === null) {
    createWindow();
  }
});

/**
 * Before quit event
 */
app.on('before-quit', () => {
  logger.info('Application shutting down...');

  // Stops the scheduler, destroys the queue service and closes the database
  container?.dispose();
  container = null;

  logger.info('Application shut down successfully');
});
