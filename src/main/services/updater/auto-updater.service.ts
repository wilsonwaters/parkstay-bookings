/**
 * Auto-Updater Service
 * Manages application updates via electron-updater and GitHub Releases
 */

import { autoUpdater, UpdateCheckResult, UpdateInfo, ProgressInfo } from 'electron-updater';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { logger } from '../../utils/logger';

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  releaseNotes?: string;
  percent?: number;
  error?: string;
}

export class AutoUpdaterService {
  private mainWindow: BrowserWindow | null = null;
  private status: UpdateStatus = { state: 'idle' };

  constructor() {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupListeners();
  }

  setWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private setupListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      this.status = { state: 'checking' };
      logger.info('Checking for updates...');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.status = {
        state: 'available',
        version: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
      };
      logger.info(`Update available: v${info.version}`);
      this.sendToRenderer(IPC_CHANNELS.UPDATE_AVAILABLE, {
        version: info.version,
        releaseNotes: this.status.releaseNotes,
      });
    });

    autoUpdater.on('update-not-available', (_info: UpdateInfo) => {
      this.status = { state: 'not-available' };
      logger.info('No updates available');
      this.sendToRenderer(IPC_CHANNELS.UPDATE_NOT_AVAILABLE, null);
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.status = {
        ...this.status,
        state: 'downloading',
        percent: progress.percent,
      };
      this.sendToRenderer(IPC_CHANNELS.UPDATE_PROGRESS, {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.status = {
        state: 'downloaded',
        version: info.version,
      };
      logger.info(`Update downloaded: v${info.version}`);
      this.sendToRenderer(IPC_CHANNELS.UPDATE_DOWNLOADED, {
        version: info.version,
      });
    });

    autoUpdater.on('error', (error: Error) => {
      this.status = {
        state: 'error',
        error: error.message,
      };
      logger.error('Auto-updater error:', error);
      this.sendToRenderer(IPC_CHANNELS.UPDATE_ERROR, {
        error: error.message,
      });
    });
  }

  private sendToRenderer(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  async checkForUpdates(): Promise<UpdateCheckResult | null> {
    try {
      return await autoUpdater.checkForUpdates();
    } catch (error: any) {
      logger.error('Failed to check for updates:', error);
      return null;
    }
  }

  async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate();
  }

  quitAndInstall(): void {
    autoUpdater.quitAndInstall();
  }

  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  /**
   * Check for updates after a delay (called on startup)
   */
  scheduleUpdateCheck(delayMs = 15000): void {
    setTimeout(async () => {
      try {
        await this.checkForUpdates();
      } catch (error) {
        logger.error('Scheduled update check failed:', error);
      }
    }, delayMs);
  }
}
