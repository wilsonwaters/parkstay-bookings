/**
 * `parkstay` handlers: transitional. The legacy watch and snipe forms' campground pickers,
 * served from the ParkStay provider's catalogue (`catalog.listLocations`, the campground
 * map) and kept in memory for 10 minutes, since the forms ask on every keystroke. Every
 * location in the map is a campground; parks and promo areas are not in it. V5 moves the
 * forms to `catalog.search` and deletes this file.
 */

import { contract } from '@shared/contracts';
import type { CampgroundSearchResult } from '@shared/types/api.types';
import type { LocationSummary } from '@shared/types/catalog.types';
import type { AppContainer } from '../../app/container';
import { PARKSTAY_PROVIDER_ID } from '../../providers/parkstay';
import type { Handle } from '../handle';

export const CAMPGROUND_CACHE_MS = 10 * 60_000;

/** A catalogue location in the shape the legacy forms read. */
export function toCampgroundSearchResult(location: LocationSummary): CampgroundSearchResult {
  return {
    id: location.externalId,
    name: location.name,
    type: 'Campground',
    ...(location.area ? { parkName: location.area.name } : {}),
    ...(location.area?.region ? { region: location.area.region } : {}),
    facilities: location.amenities,
    ...(location.imageUrls[0] ? { imageUrl: location.imageUrls[0] } : {}),
    coordinates: [location.lng, location.lat],
  };
}

export function registerParkStayHandlers(
  handle: Handle,
  c: AppContainer,
  now: () => number = Date.now
): void {
  const { parkstay } = contract;
  let cached: { at: number; campgrounds: CampgroundSearchResult[] } | undefined;
  let loading: Promise<CampgroundSearchResult[]> | undefined;

  const load = async (): Promise<CampgroundSearchResult[]> => {
    const { catalog } = c.providers.require(PARKSTAY_PROVIDER_ID, 'catalog');
    const campgrounds = (await catalog.listLocations!()).map(toCampgroundSearchResult);
    cached = { at: now(), campgrounds };
    return campgrounds;
  };

  const campgrounds = (): Promise<CampgroundSearchResult[]> => {
    if (cached && now() - cached.at < CAMPGROUND_CACHE_MS) {
      return Promise.resolve(cached.campgrounds);
    }
    loading ??= load().finally(() => {
      loading = undefined;
    });
    return loading;
  };

  handle(parkstay.searchCampgrounds, async ({ query }) => {
    const all = await campgrounds();
    const text = query.trim().toLowerCase();
    return text.length >= 2 ? all.filter((cg) => cg.name.toLowerCase().includes(text)) : all;
  });

  handle(parkstay.getAllCampgrounds, () => campgrounds());
}
