/**
 * Notifier IPC Handlers
 * Handles notifier configuration requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import {
  APIResponse,
  Notifier,
  NotifierInput,
  NotifierChannel,
  TestConnectionResult,
} from '@shared/types';
import { NotifierRepository } from '../../database/repositories/notifier.repository';
import { NotificationDispatcher } from '../../services/notification/notification-dispatcher';
import { logger } from '../../utils/logger';

export function registerNotifiersHandlers(
  notifierRepository: NotifierRepository,
  dispatcher: NotificationDispatcher
): void {
  /**
   * List all notifiers
   */
  ipcMain.handle(
    IPC_CHANNELS.NOTIFIERS_LIST,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<Notifier[]>> => {
      try {
        const notifiers = notifierRepository.findAll();

        return {
          success: true,
          data: notifiers,
        };
      } catch (error: any) {
        logger.error('Error listing notifiers:', error);
        return {
          success: false,
          error: error.message || 'Failed to list notifiers',
        };
      }
    }
  );

  /**
   * Get a specific notifier by channel
   */
  ipcMain.handle(
    IPC_CHANNELS.NOTIFIERS_GET,
    async (
      _event: IpcMainInvokeEvent,
      channel: NotifierChannel
    ): Promise<APIResponse<Notifier | null>> => {
      try {
        const notifier = notifierRepository.findByChannel(channel);

        return {
          success: true,
          data: notifier,
        };
      } catch (error: any) {
        logger.error('Error getting notifier:', error);
        return {
          success: false,
          error: error.message || 'Failed to get notifier',
        };
      }
    }
  );

  /**
   * Configure a notifier
   */
  ipcMain.handle(
    IPC_CHANNELS.NOTIFIERS_CONFIGURE,
    async (_event: IpcMainInvokeEvent, input: NotifierInput): Promise<APIResponse<Notifier>> => {
      try {
        // Upsert notifier in database
        const notifier = notifierRepository.upsert(input);

        // Update dispatcher with new configuration
        dispatcher.configureNotifier(
          input.channel,
          input.config as Record<string, unknown>,
          input.enabled || false
        );

        logger.info(`Notifier ${input.channel} configured successfully`);

        return {
          success: true,
          data: notifier,
        };
      } catch (error: any) {
        logger.error('Error configuring notifier:', error);
        return {
          success: false,
          error: error.message || 'Failed to configure notifier',
        };
      }
    }
  );

  /**
   * Enable a notifier
   */
  ipcMain.handle(
    IPC_CHANNELS.NOTIFIERS_ENABLE,
    async (_event: IpcMainInvokeEvent, channel: NotifierChannel): Promise<APIResponse<boolean>> => {
      try {
        const result = notifierRepository.enable(channel);

        if (result) {
          // Reload configurations in dispatcher
          dispatcher.loadNotifierConfigurations();
          logger.info(`Notifier ${channel} enabled`);
        }

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('Error enabling notifier:', error);
        return {
          success: false,
          error: error.message || 'Failed to enable notifier',
        };
      }
    }
  );

  /**
   * Disable a notifier
   */
  ipcMain.handle(
    IPC_CHANNELS.NOTIFIERS_DISABLE,
    async (_event: IpcMainInvokeEvent, channel: NotifierChannel): Promise<APIResponse<boolean>> => {
      try {
        const result = notifierRepository.disable(channel);

        if (result) {
          // Reload configurations in dispatcher
          dispatcher.loadNotifierConfigurations();
          logger.info(`Notifier ${channel} disabled`);
        }

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('Error disabling notifier:', error);
        return {
          success: false,
          error: error.message || 'Failed to disable notifier',
        };
      }
    }
  );

  /**
   * Test a notifier's connection
   */
  ipcMain.handle(
    IPC_CHANNELS.NOTIFIERS_TEST,
    async (
      _event: IpcMainInvokeEvent,
      channel: NotifierChannel
    ): Promise<APIResponse<TestConnectionResult>> => {
      try {
        const result = await dispatcher.testNotifier(channel);

        // Update notifier status in database
        notifierRepository.updateLastTested(channel, result.success, result.error);

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('Error testing notifier:', error);
        return {
          success: false,
          error: error.message || 'Failed to test notifier',
        };
      }
    }
  );

  logger.info('Notifier IPC handlers registered');
}
