/**
 * Electron Main Process Entry Point
 * Initializes the application, database, services, and window
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initializeDatabase, closeDatabase, getDatabase } from './database/connection';
import { ParkStayService } from './services/parkstay/parkstay.service';
import { QueueService } from './services/queue/queue.service';
import { NotificationService } from './services/notification/notification.service';
import { NotificationDispatcher } from './services/notification/notification-dispatcher';
import { WatchService } from './services/watch/watch.service';
import { STQService } from './services/stq/stq.service';
import { AuthService } from './services/auth/AuthService';
import { BookingService } from './services/booking/BookingService';
import { JobScheduler } from './scheduler/job-scheduler';
import { registerIPCHandlers } from './ipc';
import { logger } from './utils/logger';
import { SettingsRepository } from './database/repositories/SettingsRepository';
import { UserRepository } from './database/repositories/UserRepository';
import { BookingRepository } from './database/repositories/BookingRepository';
import { NotificationProviderRepository } from './database/repositories/notification-provider.repository';

// Global references
let mainWindow: BrowserWindow | null = null;
let jobScheduler: JobScheduler | null = null;
let queueService: QueueService | null = null;

/**
 * Create main window
 */
function createWindow(): void {
  const preloadPath = path.resolve(__dirname, '../preload/index.js');
  console.log('__dirname:', __dirname);
  console.log('Preload path:', preloadPath);
  console.log('Preload exists:', require('fs').existsSync(preloadPath));

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

  // Load the app
  // Check if we're in development by looking for Vite dev server
  const isDev = process.env.ELECTRON_RENDERER_URL || process.env.NODE_ENV === 'development';

  if (isDev) {
    // In development, load from Vite dev server
    const devServerUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000';
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
    logger.info(`Loading from dev server: ${devServerUrl}`);
  } else {
    // In production, load the built files
    const rendererPath = path.join(__dirname, '../../../dist/renderer/index.html');
    mainWindow.loadFile(rendererPath);
    logger.info(`Loading from file: ${rendererPath}`);
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  console.log('Main window created');
}

/**
 * Initialize database and services
 */
async function initializeApp(): Promise<void> {
  try {
    console.log('Initializing application...');

    // Initialize database
    initializeDatabase();
    const db = getDatabase();

    // Create repositories
    const userRepository = new UserRepository(db);
    const bookingRepository = new BookingRepository(db);
    const settingsRepository = new SettingsRepository(db);
    const notificationProviderRepository = new NotificationProviderRepository(db);

    // Create notification dispatcher for pluggable providers
    const notificationDispatcher = new NotificationDispatcher(notificationProviderRepository);

    // Create queue service (handles DBCA queue system)
    queueService = new QueueService();

    // Create services
    const parkStayService = new ParkStayService(queueService);
    const authService = new AuthService(userRepository);
    const bookingService = new BookingService(bookingRepository);
    const notificationService = new NotificationService(notificationDispatcher);
    const watchService = new WatchService(parkStayService, notificationService);
    const stqService = new STQService(parkStayService, notificationService);

    // Create job scheduler
    jobScheduler = new JobScheduler(watchService, stqService);

    // Register IPC handlers
    registerIPCHandlers(
      authService,
      bookingService,
      settingsRepository,
      watchService,
      stqService,
      notificationService,
      jobScheduler,
      parkStayService,
      notificationProviderRepository,
      notificationDispatcher,
      queueService
    );

    // Start job scheduler
    jobScheduler.start();

    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Failed to initialize application:', error);
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
  } catch (error) {
    logger.error('Failed to start application:', error);
    app.quit();
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
  console.log('Application shutting down...');

  // Stop job scheduler
  if (jobScheduler) {
    jobScheduler.stop();
  }

  // Clean up queue service
  if (queueService) {
    queueService.destroy();
  }

  // Close database connection
  closeDatabase();

  console.log('Application shut down successfully');
});

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  app.quit();
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
