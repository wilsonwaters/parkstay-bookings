/**
 * A place's detail and availability for the place page's tests: Bungarra (`parkstay:20`) from
 * the ParkStay fixture, given 12 photos, a description with a link, 24 sites of three types
 * and its release rule. Test data only, shaped as `catalog.get` and `catalog.checkLocation`
 * return them.
 */

import type { LocationDetail, UnitSummary } from '../../../src/shared/types/catalog.types';
import type {
  LocationAvailability,
  NightState,
  StayQuery,
  UnitAvailability,
} from '../../../src/shared/types/provider.types';
import { eachNight } from '../../../src/shared/utils/calendar-date';
import { PARKSTAY_LOCATIONS } from './parkstay-locations';

const BUNGARRA = PARKSTAY_LOCATIONS.find((place) => place.key === 'parkstay:20')!;
const MEDIA = 'https://parkstay.dbca.wa.gov.au/media/parkstay/campground_images';

/** `count` photo URLs on ParkStay's media host. */
export function photoUrls(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${MEDIA}/bungarra-${i + 1}.jpg`);
}

export const DESCRIPTION_HTML =
  '<p>A small campground on the <strong>Ningaloo coast</strong>, close to the reef.</p>' +
  '<ul><li>Bring your own water</li><li>No generators</li></ul>' +
  '<p>Read the <a href="https://exploreparks.dbca.wa.gov.au/park/cape-range-national-park" target="_blank" rel="noopener noreferrer">park guide</a> before you go.</p>';

const TYPES = ['Tent site', 'Campervan site', 'Caravan site'];

/**
 * `count` sites: "Site 01"…, typed 12 tents, 8 campervans, then caravans (for 24), taking 2–6
 * guests.
 */
export function sites(count = 24): UnitSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    unitId: String(100 + i),
    unitName: `Site ${String(i + 1).padStart(2, '0')}`,
    unitType: i < 12 ? TYPES[0] : i < 20 ? TYPES[1] : TYPES[2],
    maxPeople: i < 12 ? 6 : i < 20 ? 4 : 2,
  }));
}

export function placeDetail(overrides: Partial<LocationDetail> = {}): LocationDetail {
  return {
    ...BUNGARRA,
    imageUrls: photoUrls(12),
    descriptionHtml: DESCRIPTION_HTML,
    units: sites(24),
    unitCount: 24,
    releaseInfo: 'Bookings open 180 days ahead at midnight AWST.',
    fetchedAt: '2026-10-09T00:00:00.000Z',
    ...overrides,
  };
}

export interface AvailabilityShape {
  /** Sites free on every night. */
  fully?: number;
  /** Sites free on the first night only. */
  partly?: number;
  /** The state of every other site's nights. */
  rest?: NightState;
  /** The price of an available night. */
  price?: number;
  release?: LocationAvailability['release'];
  bookingUrl?: string;
}

/**
 * `catalog.checkLocation`'s answer for `stay` over `units`: the first `fully` sites free for
 * the whole stay, the next `partly` free on the first night only, the rest booked.
 */
export function availabilityFor(
  stay: Pick<StayQuery, 'arrival' | 'departure' | 'adults'>,
  shape: AvailabilityShape = {},
  units: readonly UnitSummary[] = sites(24)
): LocationAvailability {
  const { fully = 8, partly = 4, rest = 'booked', price = 30 } = shape;
  const nights = eachNight(stay.arrival, stay.departure);
  const result: UnitAvailability[] = units.map((unit, i) => {
    const state = (night: number): NightState =>
      i < fully ? 'available' : i < fully + partly && night === 0 ? 'available' : rest;
    const unitNights = nights.map((date, n) => {
      const s = state(n);
      return s === 'available' ? { date, state: s, price } : { date, state: s };
    });
    return {
      unitId: unit.unitId,
      unitName: unit.unitName,
      unitType: unit.unitType,
      nights: unitNights,
      fullyAvailable: unitNights.every((night) => night.state === 'available'),
    };
  });
  return {
    key: 'parkstay:20',
    checkedAt: '2026-10-09T01:00:00.000Z',
    units: result,
    release: shape.release ?? { open: true },
    bookingUrl:
      shape.bookingUrl ??
      `https://parkstay.dbca.wa.gov.au/search-availability/information/?campground_id=20&arrival=${stay.arrival.replace(/-/g, '/')}&departure=${stay.departure.replace(/-/g, '/')}`,
  };
}
