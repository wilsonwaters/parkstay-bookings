/**
 * How a location's facts read in the UI, shared by every list, map and detail view. Pure.
 */

import type { LocationSummary } from '../../shared/types/catalog.types';
import type { LocationKind } from '../../shared/types/provider.types';

/** Location kinds as a person reads them. */
export const KIND_LABELS: Record<LocationKind, string> = {
  campground: 'Campground',
  'caravan-park': 'Caravan park',
  'holiday-park': 'Holiday park',
  cabin: 'Cabin',
  hut: 'Hut',
  glamping: 'Glamping',
  'farm-stay': 'Farm stay',
  home: 'Home',
  other: 'Place to stay',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as LocationKind] ?? KIND_LABELS.other;
}

/** What a location's bookable units are called, by kind. */
const UNIT_NOUNS: Record<LocationKind, [one: string, many: string]> = {
  campground: ['site', 'sites'],
  'caravan-park': ['site', 'sites'],
  'holiday-park': ['site', 'sites'],
  cabin: ['cabin', 'cabins'],
  hut: ['bunk', 'bunks'],
  glamping: ['tent', 'tents'],
  'farm-stay': ['room', 'rooms'],
  home: ['room', 'rooms'],
  other: ['unit', 'units'],
};

/** "24 sites", "1 cabin". */
export function unitCountLabel(kind: string, count: number): string {
  const [one, many] = UNIT_NOUNS[kind as LocationKind] ?? UNIT_NOUNS.other;
  return `${count} ${count === 1 ? one : many}`;
}

/** "Cape Range National Park · Pilbara", or whichever of the two is known. */
export function areaLine(location: Pick<LocationSummary, 'area'>): string {
  return [location.area?.name, location.area?.region].filter(Boolean).join(' · ');
}

/**
 * True when the location has a usable map position: finite numbers in range, and not 0,0
 * (where a missing position lands when a provider fills the blanks with zeros).
 */
export function hasMapLocation(item: Pick<LocationSummary, 'lat' | 'lng'>): boolean {
  const { lat, lng } = item;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return !(lat === 0 && lng === 0);
}

/** "1 place", "169 places". */
export function placesLabel(count: number): string {
  return `${count} ${count === 1 ? 'place' : 'places'}`;
}
