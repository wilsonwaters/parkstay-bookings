/**
 * App IPC Handlers
 * Handles app-level IPC requests (about info, logs folder, auto-launch)
 */

import { ipcMain, IpcMainInvokeEvent, app, shell } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { APIResponse, SettingValueType, SettingCategory } from '@shared/types';
import { SettingsRepository } from '../../database/repositories/SettingsRepository';
import { logger } from '../../utils/logger';
import path from 'path';
import os from 'os';

export interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  os: string;
  arch: string;
  userDataPath: string;
  logsPath: string;
}

export function registerAppHandlers(settingsRepository: SettingsRepository): void {
  ipcMain.handle(
    IPC_CHANNELS.APP_GET_INFO,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<AppInfo>> => {
      try {
        const info: AppInfo = {
          name: app.getName(),
          version: app.getVersion(),
          electronVersion: process.versions.electron || '',
          chromeVersion: process.versions.chrome || '',
          nodeVersion: process.versions.node || '',
          os: `${os.type()} ${os.release()}`,
          arch: os.arch(),
          userDataPath: app.getPath('userData'),
          logsPath: path.join(app.getPath('userData'), 'logs'),
        };

        return { success: true, data: info };
      } catch (error: any) {
        logger.error('Error getting app info:', error);
        return {
          success: false,
          error: error.message || 'Failed to get app info',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.APP_OPEN_LOGS_FOLDER,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<boolean>> => {
      try {
        const logsPath = path.join(app.getPath('userData'), 'logs');
        await shell.openPath(logsPath);
        return { success: true, data: true };
      } catch (error: any) {
        logger.error('Error opening logs folder:', error);
        return {
          success: false,
          error: error.message || 'Failed to open logs folder',
        };
      }
    }
  );

  /**
   * Set auto-launch on login
   */
  ipcMain.handle(
    IPC_CHANNELS.APP_SET_AUTO_LAUNCH,
    async (_event: IpcMainInvokeEvent, enabled: boolean): Promise<APIResponse<boolean>> => {
      try {
        if (process.platform === 'darwin') {
          app.setLoginItemSettings({
            openAtLogin: enabled,
            openAsHidden: enabled,
          });
        } else {
          app.setLoginItemSettings({
            openAtLogin: enabled,
            args: enabled ? ['--hidden'] : [],
          });
        }

        settingsRepository.set(
          'launchOnStartup',
          enabled,
          SettingValueType.BOOLEAN,
          SettingCategory.GENERAL
        );

        logger.info(`Auto-launch ${enabled ? 'enabled' : 'disabled'}`);
        return { success: true, data: true };
      } catch (error: any) {
        logger.error('Error setting auto-launch:', error);
        return {
          success: false,
          error: error.message || 'Failed to set auto-launch',
        };
      }
    }
  );

  /**
   * Get auto-launch setting
   */
  ipcMain.handle(
    IPC_CHANNELS.APP_GET_AUTO_LAUNCH,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<boolean>> => {
      try {
        const enabled = settingsRepository.getValue<boolean>('launchOnStartup') ?? false;
        return { success: true, data: enabled };
      } catch (error: any) {
        logger.error('Error getting auto-launch setting:', error);
        return {
          success: false,
          error: error.message || 'Failed to get auto-launch setting',
        };
      }
    }
  );

  logger.info('App IPC handlers registered');
}
