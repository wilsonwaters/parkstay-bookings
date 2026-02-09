/**
 * Notification Provider IPC Handlers
 * Handles notification provider configuration requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import {
  APIResponse,
  NotificationProvider,
  NotificationProviderInput,
  NotificationChannel,
  TestConnectionResult,
} from '@shared/types';
import { NotificationProviderRepository } from '../../database/repositories/notification-provider.repository';
import { NotificationDispatcher } from '../../services/notification/notification-dispatcher';
import { logger } from '../../utils/logger';

export function registerNotificationProviderHandlers(
  providerRepository: NotificationProviderRepository,
  dispatcher: NotificationDispatcher
): void {
  /**
   * List all notification providers
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_LIST,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<NotificationProvider[]>> => {
      try {
        const providers = providerRepository.findAll();

        return {
          success: true,
          data: providers,
        };
      } catch (error: any) {
        logger.error('Error listing providers:', error);
        return {
          success: false,
          error: error.message || 'Failed to list providers',
        };
      }
    }
  );

  /**
   * Get a specific provider by channel
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_GET,
    async (
      _event: IpcMainInvokeEvent,
      channel: NotificationChannel
    ): Promise<APIResponse<NotificationProvider | null>> => {
      try {
        const provider = providerRepository.findByChannel(channel);

        return {
          success: true,
          data: provider,
        };
      } catch (error: any) {
        logger.error('Error getting provider:', error);
        return {
          success: false,
          error: error.message || 'Failed to get provider',
        };
      }
    }
  );

  /**
   * Configure a notification provider
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_CONFIGURE,
    async (
      _event: IpcMainInvokeEvent,
      input: NotificationProviderInput
    ): Promise<APIResponse<NotificationProvider>> => {
      try {
        // Upsert provider in database
        const provider = providerRepository.upsert(input);

        // Update dispatcher with new configuration
        dispatcher.configureProvider(
          input.channel,
          input.config as Record<string, unknown>,
          input.enabled || false
        );

        logger.info(`Provider ${input.channel} configured successfully`);

        return {
          success: true,
          data: provider,
        };
      } catch (error: any) {
        logger.error('Error configuring provider:', error);
        return {
          success: false,
          error: error.message || 'Failed to configure provider',
        };
      }
    }
  );

  /**
   * Enable a notification provider
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_ENABLE,
    async (
      _event: IpcMainInvokeEvent,
      channel: NotificationChannel
    ): Promise<APIResponse<boolean>> => {
      try {
        const result = providerRepository.enable(channel);

        if (result) {
          // Reload configurations in dispatcher
          dispatcher.loadProviderConfigurations();
          logger.info(`Provider ${channel} enabled`);
        }

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('Error enabling provider:', error);
        return {
          success: false,
          error: error.message || 'Failed to enable provider',
        };
      }
    }
  );

  /**
   * Disable a notification provider
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_DISABLE,
    async (
      _event: IpcMainInvokeEvent,
      channel: NotificationChannel
    ): Promise<APIResponse<boolean>> => {
      try {
        const result = providerRepository.disable(channel);

        if (result) {
          // Reload configurations in dispatcher
          dispatcher.loadProviderConfigurations();
          logger.info(`Provider ${channel} disabled`);
        }

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('Error disabling provider:', error);
        return {
          success: false,
          error: error.message || 'Failed to disable provider',
        };
      }
    }
  );

  /**
   * Test a notification provider's connection
   */
  ipcMain.handle(
    IPC_CHANNELS.PROVIDER_TEST,
    async (
      _event: IpcMainInvokeEvent,
      channel: NotificationChannel
    ): Promise<APIResponse<TestConnectionResult>> => {
      try {
        const result = await dispatcher.testProvider(channel);

        // Update provider status in database
        providerRepository.updateLastTested(
          channel,
          result.success,
          result.error
        );

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('Error testing provider:', error);
        return {
          success: false,
          error: error.message || 'Failed to test provider',
        };
      }
    }
  );

  logger.info('Notification provider IPC handlers registered');
}
