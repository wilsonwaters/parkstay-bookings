/**
 * Authentication IPC Handlers
 * Handles authentication-related IPC requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { AuthService } from '../../services/auth/AuthService';
import { UserCredentials, UserInput, APIResponse } from '@shared/types';
import { logger } from '../../utils/logger';

export function registerAuthHandlers(authService: AuthService): void {
  /**
   * Store user credentials
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_STORE_CREDENTIALS,
    async (_event: IpcMainInvokeEvent, credentials: UserInput): Promise<APIResponse<boolean>> => {
      try {
        // Validate credentials
        const validation = authService.validateCredentials(credentials);
        if (!validation.valid) {
          return {
            success: false,
            error: validation.errors.join(', '),
          };
        }

        await authService.storeCredentials(credentials);

        return {
          success: true,
          data: true,
        };
      } catch (error: any) {
        logger.error('Error storing credentials:', error);
        return {
          success: false,
          error: error.message || 'Failed to store credentials',
        };
      }
    }
  );

  /**
   * Get stored credentials
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_GET_CREDENTIALS,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<UserCredentials | null>> => {
      try {
        const credentials = await authService.getCredentials();

        return {
          success: true,
          data: credentials,
        };
      } catch (error: any) {
        logger.error('Error getting credentials:', error);
        return {
          success: false,
          error: error.message || 'Failed to get credentials',
        };
      }
    }
  );

  /**
   * Update user credentials
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_UPDATE_CREDENTIALS,
    async (
      _event: IpcMainInvokeEvent,
      email: string,
      newPassword: string
    ): Promise<APIResponse<boolean>> => {
      try {
        if (!email || !newPassword) {
          return {
            success: false,
            error: 'Email and password are required',
          };
        }

        if (newPassword.length < 8) {
          return {
            success: false,
            error: 'Password must be at least 8 characters',
          };
        }

        await authService.updateCredentials(email, newPassword);

        return {
          success: true,
          data: true,
        };
      } catch (error: any) {
        logger.error('Error updating credentials:', error);
        return {
          success: false,
          error: error.message || 'Failed to update credentials',
        };
      }
    }
  );

  /**
   * Delete user credentials
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_DELETE_CREDENTIALS,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<boolean>> => {
      try {
        await authService.deleteCredentials();

        return {
          success: true,
          data: true,
        };
      } catch (error: any) {
        logger.error('Error deleting credentials:', error);
        return {
          success: false,
          error: error.message || 'Failed to delete credentials',
        };
      }
    }
  );

  /**
   * Validate if credentials exist
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_VALIDATE_SESSION,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<boolean>> => {
      try {
        const hasCredentials = authService.hasStoredCredentials();

        return {
          success: true,
          data: hasCredentials,
        };
      } catch (error: any) {
        logger.error('Error validating session:', error);
        return {
          success: false,
          error: error.message || 'Failed to validate session',
        };
      }
    }
  );

  logger.info('Authentication IPC handlers registered');
}
