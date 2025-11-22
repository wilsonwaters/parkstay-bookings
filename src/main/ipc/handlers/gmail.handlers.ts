/**
 * Gmail IPC Handlers
 * Handles Gmail-related IPC requests from renderer
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/ipc-channels';
import { GmailOTPService } from '../../services/gmail/GmailOTPService';
import {
  OAuth2Credentials,
  GmailAuthStatus,
  OTPResult,
  GmailMessage,
} from '@shared/types/gmail.types';
import { APIResponse } from '@shared/types';
import { logger } from '../../utils/logger';

export function registerGmailHandlers(gmailService: GmailOTPService): void {
  /**
   * Set OAuth2 credentials (Client ID and Secret)
   */
  ipcMain.handle(
    IPC_CHANNELS.GMAIL_SET_CREDENTIALS,
    async (
      _event: IpcMainInvokeEvent,
      credentials: OAuth2Credentials
    ): Promise<APIResponse<boolean>> => {
      try {
        if (!credentials.clientId || !credentials.clientSecret) {
          return {
            success: false,
            error: 'Client ID and Client Secret are required',
          };
        }

        // Default redirect URI if not provided
        if (!credentials.redirectUri) {
          credentials.redirectUri = 'http://localhost:3000/oauth2callback';
        }

        gmailService.setCredentials(credentials);

        logger.info('Gmail OAuth2 credentials set successfully');

        return {
          success: true,
          data: true,
        };
      } catch (error: any) {
        logger.error('Error setting Gmail credentials:', error);
        return {
          success: false,
          error: error.message || 'Failed to set credentials',
        };
      }
    }
  );

  /**
   * Get stored OAuth2 credentials
   */
  ipcMain.handle(
    IPC_CHANNELS.GMAIL_GET_CREDENTIALS,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<OAuth2Credentials | null>> => {
      try {
        const credentials = gmailService.getCredentials();

        return {
          success: true,
          data: credentials,
        };
      } catch (error: any) {
        logger.error('Error getting Gmail credentials:', error);
        return {
          success: false,
          error: error.message || 'Failed to get credentials',
        };
      }
    }
  );

  /**
   * Initiate Gmail authorization flow
   */
  ipcMain.handle(
    IPC_CHANNELS.GMAIL_AUTHORIZE,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<boolean>> => {
      try {
        logger.info('Starting Gmail authorization flow...');

        const result = await gmailService.authorize();

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Authorization failed',
          };
        }

        logger.info('Gmail authorization successful');

        return {
          success: true,
          data: true,
        };
      } catch (error: any) {
        logger.error('Error during Gmail authorization:', error);
        return {
          success: false,
          error: error.message || 'Authorization failed',
        };
      }
    }
  );

  /**
   * Check Gmail authorization status
   */
  ipcMain.handle(
    IPC_CHANNELS.GMAIL_CHECK_AUTH_STATUS,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<GmailAuthStatus>> => {
      try {
        const status = gmailService.getAuthStatus();

        return {
          success: true,
          data: status,
        };
      } catch (error: any) {
        logger.error('Error checking Gmail auth status:', error);
        return {
          success: false,
          error: error.message || 'Failed to check authorization status',
        };
      }
    }
  );

  /**
   * Revoke Gmail authorization
   */
  ipcMain.handle(
    IPC_CHANNELS.GMAIL_REVOKE_AUTH,
    async (_event: IpcMainInvokeEvent): Promise<APIResponse<boolean>> => {
      try {
        const success = await gmailService.revokeAuthorization();

        if (!success) {
          return {
            success: false,
            error: 'Failed to revoke authorization',
          };
        }

        logger.info('Gmail authorization revoked successfully');

        return {
          success: true,
          data: true,
        };
      } catch (error: any) {
        logger.error('Error revoking Gmail authorization:', error);
        return {
          success: false,
          error: error.message || 'Failed to revoke authorization',
        };
      }
    }
  );

  /**
   * Wait for email and extract OTP/magic link
   */
  ipcMain.handle(
    IPC_CHANNELS.GMAIL_WAIT_FOR_EMAIL,
    async (
      _event: IpcMainInvokeEvent,
      fromEmail: string,
      subject: string,
      timeout?: number
    ): Promise<APIResponse<OTPResult>> => {
      try {
        if (!fromEmail || !subject) {
          return {
            success: false,
            error: 'From email and subject are required',
          };
        }

        // Check if authorized
        if (!gmailService.isAuthorized()) {
          return {
            success: false,
            error: 'Gmail not authorized. Please authorize first.',
          };
        }

        logger.info(`Waiting for email from ${fromEmail} with subject "${subject}"`);

        const result = await gmailService.waitForEmail(fromEmail, subject, timeout);

        if (!result.found) {
          return {
            success: false,
            error: 'Email not found within timeout period',
            data: result,
          };
        }

        logger.info('Email found successfully', {
          hasCode: !!result.code,
          hasLink: !!result.link,
        });

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('Error waiting for email:', error);
        return {
          success: false,
          error: error.message || 'Failed to wait for email',
        };
      }
    }
  );

  /**
   * Get recent emails (for testing/debugging)
   */
  ipcMain.handle(
    IPC_CHANNELS.GMAIL_GET_RECENT_EMAILS,
    async (
      _event: IpcMainInvokeEvent,
      maxResults?: number
    ): Promise<APIResponse<GmailMessage[]>> => {
      try {
        // Check if authorized
        if (!gmailService.isAuthorized()) {
          return {
            success: false,
            error: 'Gmail not authorized. Please authorize first.',
          };
        }

        const messages = await gmailService.getRecentEmails(maxResults || 10);

        return {
          success: true,
          data: messages,
        };
      } catch (error: any) {
        logger.error('Error getting recent emails:', error);
        return {
          success: false,
          error: error.message || 'Failed to get recent emails',
        };
      }
    }
  );

  /**
   * Test email search (for debugging)
   */
  ipcMain.handle(
    IPC_CHANNELS.GMAIL_TEST_SEARCH,
    async (
      _event: IpcMainInvokeEvent,
      fromEmail: string,
      subject: string
    ): Promise<APIResponse<GmailMessage[]>> => {
      try {
        if (!fromEmail || !subject) {
          return {
            success: false,
            error: 'From email and subject are required',
          };
        }

        // Check if authorized
        if (!gmailService.isAuthorized()) {
          return {
            success: false,
            error: 'Gmail not authorized. Please authorize first.',
          };
        }

        const messages = await gmailService.testEmailSearch(fromEmail, subject);

        return {
          success: true,
          data: messages,
        };
      } catch (error: any) {
        logger.error('Error testing email search:', error);
        return {
          success: false,
          error: error.message || 'Failed to test search',
        };
      }
    }
  );

  logger.info('Gmail IPC handlers registered');
}
