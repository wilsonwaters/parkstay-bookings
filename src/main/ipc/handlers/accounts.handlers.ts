/**
 * `accounts` handlers. Provider accounts and sign-in windows are not built yet (V6), so every
 * method validates its request and then answers `NOT_IMPLEMENTED`.
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import { AppError } from '../../utils/app-error';
import type { Handle } from '../handle';

const notYet = (): never => {
  throw new AppError('NOT_IMPLEMENTED', 'Provider accounts are not available yet');
};

export function registerAccountsHandlers(handle: Handle, _c: AppContainer): void {
  const api = contract.accounts;

  handle(api.list, notYet);
  handle(api.status, notYet);
  handle(api.signIn, notYet);
  handle(api.signOut, notYet);
  handle(api.openSignInLink, notYet);
}
