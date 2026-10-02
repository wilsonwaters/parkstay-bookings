/**
 * `gmail` handlers: OAuth connect, disconnect and status. The client secret is write-only,
 * and the inbox is never read over IPC (the OTP methods stay main-only for V6).
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import { AppError } from '../../utils/app-error';
import { logger } from '../../utils/logger';
import type { Handle } from '../handle';

export function registerGmailHandlers(handle: Handle, c: AppContainer): void {
  const { gmail } = contract;
  const service = c.gmailService;

  handle(gmail.setCredentials, ({ clientId, clientSecret }) => {
    if (!clientId || !clientSecret) {
      throw new AppError('VALIDATION', 'Client ID and Client Secret are required');
    }
    service.setCredentials({ clientId, clientSecret });
    logger.info('Gmail OAuth2 credentials set successfully');
    return true;
  });

  handle(gmail.getCredentials, () => service.getCredentialStatus());

  handle(gmail.authorize, async () => {
    logger.info('Starting Gmail authorization flow...');
    const result = await service.authorize();
    if (!result.success) throw new Error(result.error || 'Authorization failed');
    logger.info('Gmail authorization successful');
    return true;
  });

  handle(gmail.checkAuthStatus, () => service.getAuthStatus());

  handle(gmail.revokeAuth, async () => {
    if (!(await service.revokeAuthorization())) throw new Error('Failed to revoke authorization');
    logger.info('Gmail authorization revoked successfully');
    return true;
  });
}
