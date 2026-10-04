/**
 * Pure geometry for Explore's map: where a location is, whether it is in the visible area,
 * and the GeoJSON the map draws. No mapbox-gl import, so the list-only mode and the tests
 * never load it.
 */

import type { BoundingBox, LocationSummary } from '../../../../shared/types/catalog.types';
import { hasMapLocation } from '../../../components/locationFormat';

export { hasMapLocation };

/** Western Australia, `[[west, south], [east, north]]`: the map's first view. */
export const WA_BOUNDS: [[number, number], [number, number]] = [
  [112.5, -35.6],
  [129.2, -13.5],
];

/** The longest name a map pill shows before it is cut with "…". */
export const PILL_LABEL_MAX = 22;

/**
 * True when the location lies inside `bbox` (`[west, south, east, north]`, edges included).
 * A box whose west edge is east of its east edge crosses the antimeridian. A location with no
 * map position is in no area.
 */
export function withinBbox(item: Pick<LocationSummary, 'lat' | 'lng'>, bbox: BoundingBox): boolean {
  if (!hasMapLocation(item)) return false;
  const [west, south, east, north] = bbox;
  if (item.lat < south || item.lat > north) return false;
  return west <= east ? item.lng >= west && item.lng <= east : item.lng >= west || item.lng <= east;
}

/** The box around every mappable location, or null when none has a position. */
export function boundsOf(
  items: readonly Pick<LocationSummary, 'lat' | 'lng'>[]
): BoundingBox | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const item of items) {
    if (!hasMapLocation(item)) continue;
    west = Math.min(west, item.lng);
    east = Math.max(east, item.lng);
    south = Math.min(south, item.lat);
    north = Math.max(north, item.lat);
  }
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

/** The name as a map pill shows it: cut to 22 characters with "…". */
export function pillLabel(name: string): string {
  const trimmed = name.trim();
  const chars = Array.from(trimmed);
  return chars.length > PILL_LABEL_MAX
    ? `${chars.slice(0, PILL_LABEL_MAX).join('').trimEnd()}…`
    : trimmed;
}

export interface LocationFeatureProperties {
  /** The location key; the source promotes it to the feature id. */
  key: string;
  name: string;
  /** The pill text: the name, truncated. */
  label: string;
}

export interface LocationFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: LocationFeatureProperties;
}

export interface LocationFeatureCollection {
  type: 'FeatureCollection';
  features: LocationFeature[];
}

/** The map's GeoJSON: one point per mappable location, keyed by its location key. */
export function toFeatureCollection(
  items: readonly Pick<LocationSummary, 'key' | 'name' | 'lat' | 'lng'>[]
): LocationFeatureCollection {
  const features: LocationFeature[] = [];
  for (const item of items) {
    if (!hasMapLocation(item)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
      properties: { key: item.key, name: item.name, label: pillLabel(item.name) },
    });
  }
  return { type: 'FeatureCollection', features };
}
