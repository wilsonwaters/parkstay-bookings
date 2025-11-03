/**
 * Settings IPC Handlers
 * Handles settings-related IPC requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { SettingsRepository } from '../../database/repositories/SettingsRepository';
import { APIResponse, SettingValueType, SettingCategory } from '@shared/types';
import { logger } from '../../utils/logger';

export function registerSettingsHandlers(settingsRepository: SettingsRepository): void {
  /**
   * Get setting by key
   */
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (_event: IpcMainInvokeEvent, key: string): Promise<APIResponse<any>> => {
      try {
        const value = settingsRepository.getValue(key);

        return {
          success: true,
          data: value,
        };
      } catch (error: any) {
        logger.error('Error getting setting:', error);
        return {
          success: false,
          error: error.message || 'Failed to get setting',
        };
      }
    }
  );

  /**
   * Set setting value
   */
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    async (
      _event: IpcMainInvokeEvent,
      key: string,
      value: any,
      valueType: SettingValueType,
      category: SettingCategory
    ): Promise<APIResponse<boolean>> => {
      try {
        settingsRepository.set(key, value, valueType, category);

        return {
          success: true,
          data: true,
        };
      } catch (error: any) {
        logger.error('Error setting value:', error);
        return {
          success: false,
          error: error.message || 'Failed to set setting',
        };
      }
    }
  );

  /**
   * Get all settings
   */
  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_ALL,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<Record<string, any>>> => {
      try {
        const settings = settingsRepository.getAllAsObject();

        return {
          success: true,
          data: settings,
        };
      } catch (error: any) {
        logger.error('Error getting all settings:', error);
        return {
          success: false,
          error: error.message || 'Failed to get settings',
        };
      }
    }
  );

  logger.info('Settings IPC handlers registered');
}
