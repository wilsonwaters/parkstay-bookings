/**
 * `catalog` handlers. The location catalogue service is not built yet (V5), so every method
 * validates its request and then answers `NOT_IMPLEMENTED`.
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import { AppError } from '../../utils/app-error';
import type { Handle } from '../handle';

const notYet = (): never => {
  throw new AppError('NOT_IMPLEMENTED', 'The location catalogue is not available yet');
};

export function registerCatalogHandlers(handle: Handle, _c: AppContainer): void {
  const api = contract.catalog;

  handle(api.search, notYet);
  handle(api.get, notYet);
  handle(api.availability, notYet);
  handle(api.checkLocation, notYet);
  handle(api.refresh, notYet);
  handle(api.status, notYet);
}
