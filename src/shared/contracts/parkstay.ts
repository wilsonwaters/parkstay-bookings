/**
 * `parkstay`: transitional. The legacy watch and snipe forms pick a campground from this list,
 * which main serves from the ParkStay provider's catalogue (campgrounds only, never parks or
 * promo areas). V5 moves the forms to `catalog.search` and retires the namespace.
 */

import { z } from 'zod';
import type { CampgroundSearchResult } from '../types/api.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

const C = CHANNELS.parkstay;

export const parkstay = {
  /** Campgrounds whose name contains `query` (two characters or more; otherwise every one). */
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
} satisfies Namespace;
