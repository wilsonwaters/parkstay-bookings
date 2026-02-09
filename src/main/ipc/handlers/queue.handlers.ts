/**
 * Queue IPC Handlers
 * Handles queue-related requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { APIResponse, QueueSession, QueueStatusEvent } from '@shared/types';
import { QueueService } from '../../services/queue/queue.service';
import { logger } from '../../utils/logger';

export function registerQueueHandlers(queueService: QueueService): void {
  /**
   * Check queue status (or create session if none exists)
   */
  ipcMain.handle(
    IPC_CHANNELS.QUEUE_CHECK,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<QueueSession>> => {
      try {
        const session = await queueService.checkOrCreateSession();
        return {
          success: true,
          data: session,
        };
      } catch (error: any) {
        logger.error('Error checking queue:', error);
        return {
          success: false,
          error: error.message || 'Failed to check queue status',
        };
      }
    }
  );

  /**
   * Wait for active session (polls until queue clears)
   */
  ipcMain.handle(
    IPC_CHANNELS.QUEUE_WAIT,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<QueueSession>> => {
      try {
        const result = await queueService.waitForActive();

        if (result.success && result.session) {
          return {
            success: true,
            data: result.session,
          };
        }

        return {
          success: false,
          error: result.error || 'Failed to obtain active session',
        };
      } catch (error: any) {
        logger.error('Error waiting in queue:', error);
        return {
          success: false,
          error: error.message || 'Failed to wait in queue',
        };
      }
    }
  );

  /**
   * Get current queue status without making API call
   */
  ipcMain.handle(
    IPC_CHANNELS.QUEUE_GET_STATUS,
    async (
      _event: IpcMainInvokeEvent
    ): Promise<
      APIResponse<{
        session: QueueSession | null;
        isActive: boolean;
        isExpired: boolean;
        isWaiting: boolean;
        estimatedWait: string;
        expiryRemaining: string;
      }>
    > => {
      try {
        const session = queueService.getSession();
        return {
          success: true,
          data: {
            session,
            isActive: queueService.isSessionActive(),
            isExpired: queueService.isSessionExpired(),
            isWaiting: queueService.isWaitingInQueue(),
            estimatedWait: queueService.getEstimatedWaitFormatted(),
            expiryRemaining: queueService.getExpiryTimeRemaining(),
          },
        };
      } catch (error: any) {
        logger.error('Error getting queue status:', error);
        return {
          success: false,
          error: error.message || 'Failed to get queue status',
        };
      }
    }
  );

  /**
   * Clear queue session
   */
  ipcMain.handle(
    IPC_CHANNELS.QUEUE_CLEAR,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<void>> => {
      try {
        queueService.clearSession();
        return {
          success: true,
        };
      } catch (error: any) {
        logger.error('Error clearing queue session:', error);
        return {
          success: false,
          error: error.message || 'Failed to clear queue session',
        };
      }
    }
  );

  // Forward queue status events to all renderer windows
  queueService.on('status', (event: QueueStatusEvent) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.QUEUE_STATUS_UPDATE, event);
      }
    });
  });

  logger.info('Queue IPC handlers registered');
}
