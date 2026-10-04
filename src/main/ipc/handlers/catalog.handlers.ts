/**
 * `catalog` handlers: the location catalogue service (`core/catalog`). Requests are parsed
 * with the contract's schemas by `handle()`, and provider errors map through `toApiError`
 * there. Syncs reach the renderer as `catalog:updated` events, which the service emits on the
 * renderer events bus.
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import type { Handle } from '../handle';

export function registerCatalogHandlers(handle: Handle, c: AppContainer): void {
  const api = contract.catalog;
  const catalog = c.catalogService;

  handle(api.search, (query) => catalog.search(query));
  handle(api.get, ({ key }) => catalog.get(key));
  handle(api.availability, ({ stay, providerIds, bbox }) =>
    catalog.availability(stay, { providerIds, bbox })
  );
  handle(api.checkLocation, ({ key, stay }) => catalog.checkLocation(key, stay));
  handle(api.refresh, ({ providerId }) => catalog.refresh(providerId));
  handle(api.status, () => catalog.status());
}
