/**
 * `gmail` handlers, ported as they were. P4 removes the inbox reads and stops returning the
 * OAuth client secret.
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import { AppError } from '../../utils/app-error';
import { logger } from '../../utils/logger';
import type { Handle } from '../handle';

const DEFAULT_REDIRECT_URI = 'http://localhost:3000/oauth2callback';

export function registerGmailHandlers(handle: Handle, c: AppContainer): void {
  const { gmail } = contract;
  const service = c.gmailService;

  const requireAuthorized = (): void => {
    if (!service.isAuthorized()) throw new Error('Gmail not authorized. Please authorize first.');
  };

  handle(gmail.setCredentials, ({ clientId, clientSecret, redirectUri }) => {
    if (!clientId || !clientSecret) {
      throw new AppError('VALIDATION', 'Client ID and Client Secret are required');
    }
    service.setCredentials({
      clientId,
      clientSecret,
      redirectUri: redirectUri || DEFAULT_REDIRECT_URI,
    });
    logger.info('Gmail OAuth2 credentials set successfully');
    return true;
  });

  handle(gmail.getCredentials, () => service.getCredentials());

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

  handle(gmail.waitForEmail, async ({ fromEmail, subject, timeout }) => {
    requireAuthorized();
    const result = await service.waitForEmail(fromEmail, subject, timeout);
    if (!result.found) throw new Error('Email not found within timeout period');
    logger.info('Email found successfully', { hasCode: !!result.code, hasLink: !!result.link });
    return result;
  });

  handle(gmail.getRecentEmails, ({ maxResults }) => {
    requireAuthorized();
    return service.getRecentEmails(maxResults || 10);
  });

  handle(gmail.testSearch, ({ fromEmail, subject }) => {
    requireAuthorized();
    return service.testEmailSearch(fromEmail, subject);
  });
}
