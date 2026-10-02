/**
 * `catalog`: locations from every catalogue provider (search, detail, availability).
 * Syncs arrive as `catalog:updated` events.
 *
 * The handlers answer `NOT_IMPLEMENTED` until the catalogue service lands (V5); the request
 * schemas are already enforced.
 */

import { z } from 'zod';
import {
  BoundingBoxSchema,
  CatalogQuerySchema,
  type BoundingBox,
  type CatalogAvailabilityResult,
  type CatalogQuery,
  type CatalogSearchResult,
  type CatalogStatus,
  type LocationDetail,
} from '../types/catalog.types';
import {
  ProviderIdSchema,
  StayQuerySchema,
  type LocationAvailability,
  type ProviderId,
  type StayQuery,
} from '../types/provider.types';
import { LocationKeySchema } from '../utils/location-key';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

/** Narrows `catalog.availability` to some providers or a map area. */
export interface CatalogAvailabilityOptions {
  providerIds?: ProviderId[];
  bbox?: BoundingBox;
}

const C = CHANNELS.catalog;

export const catalog = {
  search: {
    channel: C.search,
    request: CatalogQuerySchema,
    args: {} as [query: CatalogQuery],
    response: {} as CatalogSearchResult,
  },
  get: {
    channel: C.get,
    request: z.object({ key: LocationKeySchema }),
    args: {} as [key: string],
    response: {} as LocationDetail,
  },
  /** Bulk availability across providers; failing providers are listed in `errors`. */
  availability: {
    channel: C.availability,
    request: z.object({
      stay: StayQuerySchema,
      providerIds: z.array(ProviderIdSchema).optional(),
      bbox: BoundingBoxSchema.optional(),
    }),
    args: {} as [stay: StayQuery, options?: CatalogAvailabilityOptions],
    response: {} as CatalogAvailabilityResult,
  },
  checkLocation: {
    channel: C.checkLocation,
    request: z.object({ key: LocationKeySchema, stay: StayQuerySchema }),
    args: {} as [key: string, stay: StayQuery],
    response: {} as LocationAvailability,
  },
  /** Re-syncs one provider's catalogue (or all), then returns the status. */
  refresh: {
    channel: C.refresh,
    request: z.object({ providerId: ProviderIdSchema.optional() }),
    args: {} as [providerId?: ProviderId],
    response: {} as CatalogStatus,
  },
  status: { channel: C.status, request: z.void(), args: {} as [], response: {} as CatalogStatus },
} satisfies Namespace;
