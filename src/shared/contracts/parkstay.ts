/**
 * `parkstay`: transitional direct ParkStay access, ported as it was. V3 moves ParkStay
 * behind the provider registry and the `catalog` namespace.
 */

import { z } from 'zod';
import type { AvailabilityCheckResult, CampgroundSearchResult } from '../types/api.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

export interface AvailabilityParams {
  arrivalDate: string;
  departureDate: string;
  numGuests: number;
  siteType?: string;
}

const C = CHANNELS.parkstay;

export const parkstay = {
  searchCampgrounds: {
    channel: C.searchCampgrounds,
    request: z.object({ query: z.string() }),
    args: {} as [query: string],
    response: {} as CampgroundSearchResult[],
  },
  getAllCampgrounds: {
    channel: C.getAllCampgrounds,
    request: z.void(),
    args: {} as [],
    response: {} as CampgroundSearchResult[],
  },
  checkAvailability: {
    channel: C.checkAvailability,
    request: z.object({
      campgroundId: z.string().min(1),
      params: z.object({
        arrivalDate: z.string(),
        departureDate: z.string(),
        numGuests: z.number().int().positive(),
        siteType: z.string().optional(),
      }),
    }),
    args: {} as [campgroundId: string, params: AvailabilityParams],
    response: {} as AvailabilityCheckResult,
  },
} satisfies Namespace;
