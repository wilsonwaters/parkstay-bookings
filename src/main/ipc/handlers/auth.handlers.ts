/**
 * `auth` handlers: transitional ParkStay credential storage (V6 replaces it). The password
 * is write-only: `getCredentials` returns `{ email, hasPassword }`. Logout
 * (`deleteCredentials`) clears only the credential fields; the local profile row and its
 * data are kept.
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import { AppError } from '../../utils/app-error';
import type { Handle } from '../handle';

export function registerAuthHandlers(handle: Handle, c: AppContainer): void {
  const { auth } = contract;

  handle(auth.storeCredentials, async (credentials) => {
    const validation = c.authService.validateCredentials(credentials);
    if (!validation.valid) throw new AppError('VALIDATION', validation.errors.join(', '));
    await c.authService.storeCredentials(credentials);
    return true;
  });

  handle(auth.getCredentials, () => c.authService.getCredentialStatus());

  handle(auth.updateCredentials, async ({ email, newPassword }) => {
    if (!email || !newPassword) {
      throw new AppError('VALIDATION', 'Email and password are required');
    }
    if (newPassword.length < 8) {
      throw new AppError('VALIDATION', 'Password must be at least 8 characters');
    }
    await c.authService.updateCredentials(email, newPassword);
    return true;
  });

  handle(auth.deleteCredentials, async () => {
    await c.authService.deleteCredentials();
    return true;
  });

  handle(auth.validateSession, () => c.authService.hasStoredCredentials());
}
