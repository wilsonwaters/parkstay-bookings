/**
 * Auto-Updater Service
 * Manages application updates via electron-updater and GitHub Releases
 */

import { autoUpdater, UpdateCheckResult, UpdateInfo, ProgressInfo } from 'electron-updater';
import type { EventSink } from '@shared/contracts/events';
import type { UpdateStatus } from '@shared/contracts/updater';
import { logger } from '../../utils/logger';

export type { UpdateStatus };

export class AutoUpdaterService {
  private status: UpdateStatus = { state: 'idle' };

  /** `events` delivers `updater:*` events to trusted renderers only. */
  constructor(private readonly events: EventSink) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupListeners();
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
      this.events.emit('updater:available', {
        version: info.version,
        releaseNotes: this.status.releaseNotes,
      });
    });

    autoUpdater.on('update-not-available', (_info: UpdateInfo) => {
      this.status = { state: 'not-available' };
      logger.info('No updates available');
      this.events.emit('updater:not-available', null);
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.status = {
        ...this.status,
        state: 'downloading',
        percent: progress.percent,
      };
      this.events.emit('updater:progress', {
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
      this.events.emit('updater:downloaded', {
        version: info.version,
      });
    });

    autoUpdater.on('error', (error: Error) => {
      this.status = {
        state: 'error',
        error: error.message,
      };
      logger.error('Auto-updater error:', error);
      this.events.emit('updater:error', {
        error: error.message,
      });
    });
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
