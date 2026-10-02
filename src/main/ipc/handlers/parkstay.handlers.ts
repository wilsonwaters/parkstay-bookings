/**
 * `parkstay` handlers: transitional direct ParkStay access (V3 replaces it).
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import type { Handle } from '../handle';

export function registerParkStayHandlers(handle: Handle, c: AppContainer): void {
  const { parkstay } = contract;
  const service = c.parkStayService;

  handle(parkstay.searchCampgrounds, ({ query }) => service.searchCampgrounds(query));

  // An empty query returns every campground
  handle(parkstay.getAllCampgrounds, () => service.searchCampgrounds(''));

  handle(parkstay.checkAvailability, ({ campgroundId, params }) =>
    service.checkAvailability(campgroundId, { campgroundId, ...params })
  );
}
