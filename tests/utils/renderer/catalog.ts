/**
 * `window.api.catalog` stubs for renderer tests, answering like the catalogue service over a
 * fixture (the 169 ParkStay campgrounds by default):
 *
 *   renderWithApp({ api: catalogApi() });
 *   renderWithApp({ api: catalogApi({ status: syncingStatus() }) });
 */

import type {
  CatalogQuery,
  CatalogStatus,
  LocationSummary,
} from '../../../src/shared/types/catalog.types';
import { PARKSTAY_LOCATIONS, searchLocations } from '../../fixtures/catalog/parkstay-locations';
import { ok, type ApiStubs } from './createMockApi';

export interface CatalogApiOptions {
  items?: readonly LocationSummary[];
  status?: CatalogStatus;
  /** Replace or add catalog methods. */
  catalog?: Record<string, jest.Mock>;
  /** Other namespaces, merged in. */
  stubs?: ApiStubs;
}

export function syncedStatus(count = PARKSTAY_LOCATIONS.length): CatalogStatus {
  return {
    providers: [
      {
        providerId: 'parkstay',
        count,
        syncedAt: '2026-10-04T00:00:00Z',
        stale: false,
        syncing: false,
      },
    ],
  };
}

export function syncingStatus(): CatalogStatus {
  return { providers: [{ providerId: 'parkstay', count: 0, stale: true, syncing: true }] };
}

/** Before the first sync (it starts 5 s after launch): not syncing yet, no error. */
export function pendingStatus(): CatalogStatus {
  return { providers: [{ providerId: 'parkstay', count: 0, stale: true, syncing: false }] };
}

export function failedStatus(): CatalogStatus {
  return {
    providers: [
      {
        providerId: 'parkstay',
        count: 0,
        stale: true,
        syncing: false,
        lastError: "ParkStay didn't respond",
      },
    ],
  };
}

/** A `catalog.search` that filters `items` as main would. */
export function searchStub(items: readonly LocationSummary[] = PARKSTAY_LOCATIONS): jest.Mock {
  return jest.fn(async (query: CatalogQuery) => ok(searchLocations(query, items)));
}

export function catalogApi(options: CatalogApiOptions = {}): ApiStubs {
  const items = options.items ?? PARKSTAY_LOCATIONS;
  return {
    ...options.stubs,
    catalog: {
      search: searchStub(items),
      status: jest.fn().mockResolvedValue(ok(options.status ?? syncedStatus(items.length))),
      refresh: jest.fn().mockResolvedValue(ok(options.status ?? syncedStatus(items.length))),
      ...options.catalog,
    },
  };
}

/** The fixture place with this name. */
export function placeNamed(name: string): LocationSummary {
  const place = PARKSTAY_LOCATIONS.find((p) => p.name === name);
  if (!place) throw new Error(`No fixture place named ${name}`);
  return place;
}
