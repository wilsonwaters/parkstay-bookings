/**
 * Updater IPC Handlers
 * Handles update-related IPC requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { AutoUpdaterService } from '../../services/updater/auto-updater.service';
import { APIResponse } from '@shared/types';
import { logger } from '../../utils/logger';

export function registerUpdaterHandlers(updaterService: AutoUpdaterService): void {
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_CHECK,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<any>> => {
      try {
        const result = await updaterService.checkForUpdates();
        return {
          success: true,
          data: result ? { version: result.updateInfo?.version } : null,
        };
      } catch (error: any) {
        logger.error('Error checking for updates:', error);
        return {
          success: false,
          error: error.message || 'Failed to check for updates',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_DOWNLOAD,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<boolean>> => {
      try {
        await updaterService.downloadUpdate();
        return { success: true, data: true };
      } catch (error: any) {
        logger.error('Error downloading update:', error);
        return {
          success: false,
          error: error.message || 'Failed to download update',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_INSTALL,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<boolean>> => {
      try {
        updaterService.quitAndInstall();
        return { success: true, data: true };
      } catch (error: any) {
        logger.error('Error installing update:', error);
        return {
          success: false,
          error: error.message || 'Failed to install update',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_GET_STATUS,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<any>> => {
      try {
        const status = updaterService.getStatus();
        return { success: true, data: status };
      } catch (error: any) {
        logger.error('Error getting update status:', error);
        return {
          success: false,
          error: error.message || 'Failed to get update status',
        };
      }
    }
  );

  logger.info('Updater IPC handlers registered');
}
