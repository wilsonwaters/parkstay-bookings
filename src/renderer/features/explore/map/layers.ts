/**
 * The map's own source and layers, built from the design tokens. Pure: no mapbox-gl at run
 * time (only its types), so tests can check every id, filter and colour.
 *
 * - `clusters` + `cluster-count`: white circles with an ink outline and count, larger as they
 *   hold more places.
 * - `location-dot`: one white dot with an ink ring per place; ink and larger while hovered or
 *   selected. Dots never collide, so every place stays visible.
 * - `location-pill`: the name on a white pill from zoom 8; ink with white text while hovered
 *   or selected. Pills that would overlap are hidden (the dot stays).
 *
 * Every pair is ink on white or white on ink (17.79:1, `fg` on `surface` and `fg-inverse` on
 * `surface-inverse` in CONTRAST_PAIRS).
 */

import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  GeoJSONSourceSpecification,
  SymbolLayerSpecification,
} from 'mapbox-gl';
import type { MapTokens } from './types';

export const SOURCE_ID = 'locations';
export const PILL_IMAGE_ID = 'ws-pill';

export const LAYER_IDS = {
  clusters: 'clusters',
  clusterCount: 'cluster-count',
  dot: 'location-dot',
  pill: 'location-pill',
} as const;

/** Places within 48 px are clustered, up to zoom 10. */
export const CLUSTER_RADIUS = 48;
export const CLUSTER_MAX_ZOOM = 10;
/** Name pills show from this zoom. */
export const PILL_MIN_ZOOM = 8;
/** The furthest a search result fit zooms in. */
export const FIT_MAX_ZOOM = 11;

/** `text-font` for every label the app adds: fonts the outdoors style already loads. */
export const MAP_FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular'];

export const SOURCE_SPEC: GeoJSONSourceSpecification = {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
  promoteId: 'key',
  cluster: true,
  clusterRadius: CLUSTER_RADIUS,
  clusterMaxZoom: CLUSTER_MAX_ZOOM,
};

/** True while the place is hovered or selected (feature state). */
export const ACTIVE: ExpressionSpecification = [
  'any',
  ['boolean', ['feature-state', 'hover'], false],
  ['boolean', ['feature-state', 'selected'], false],
];

const CLUSTERED: ExpressionSpecification = ['has', 'point_count'];
const UNCLUSTERED: ExpressionSpecification = ['!', ['has', 'point_count']];

export type MapLayer = CircleLayerSpecification | SymbolLayerSpecification;

/** The layers, in the order they are added (bottom to top). */
export function buildLayers(tokens: MapTokens): MapLayer[] {
  const clusters: CircleLayerSpecification = {
    id: LAYER_IDS.clusters,
    type: 'circle',
    source: SOURCE_ID,
    filter: CLUSTERED,
    paint: {
      'circle-color': tokens.white,
      'circle-stroke-color': tokens.ink,
      'circle-stroke-width': 1.5,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 22],
    },
  };

  const clusterCount: SymbolLayerSpecification = {
    id: LAYER_IDS.clusterCount,
    type: 'symbol',
    source: SOURCE_ID,
    filter: CLUSTERED,
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': MAP_FONT,
      'text-size': 12,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': tokens.ink },
  };

  const dot: CircleLayerSpecification = {
    id: LAYER_IDS.dot,
    type: 'circle',
    source: SOURCE_ID,
    filter: UNCLUSTERED,
    paint: {
      'circle-color': ['case', ACTIVE, tokens.ink, tokens.white],
      'circle-stroke-color': ['case', ACTIVE, tokens.white, tokens.ink],
      'circle-stroke-width': 2,
      'circle-radius': ['case', ACTIVE, 8, 5],
    },
  };

  const pill: SymbolLayerSpecification = {
    id: LAYER_IDS.pill,
    type: 'symbol',
    source: SOURCE_ID,
    filter: UNCLUSTERED,
    minzoom: PILL_MIN_ZOOM,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': MAP_FONT,
      'text-size': 12,
      'text-anchor': 'bottom',
      'text-offset': [0, -1.1],
      'text-max-width': 30,
      'icon-image': PILL_IMAGE_ID,
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [4, 10, 4, 10],
      'icon-anchor': 'bottom',
    },
    paint: {
      'icon-color': ['case', ACTIVE, tokens.ink, tokens.white],
      'icon-halo-color': tokens.ink,
      'icon-halo-width': 1,
      'text-color': ['case', ACTIVE, tokens.white, tokens.ink],
    },
  };

  return [clusters, clusterCount, dot, pill];
}

/** The layers a pointer can hover or click. */
export const INTERACTIVE_LAYERS = [LAYER_IDS.clusters, LAYER_IDS.dot, LAYER_IDS.pill];

/**
 * The pill under every name: a rounded rectangle as a signed distance field, so the layer can
 * recolour it (`icon-color`) and outline it (`icon-halo-*`) per feature, and stretch it to fit
 * the text. The middle stretches; the rounded ends do not.
 *
 * Mapbox reads an SDF icon's alpha as distance: 0.75 on the edge, falling 1/8 per pixel
 * outwards (at the icon's own pixel ratio).
 */
export function pillImage(pixelRatio = 2): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  options: {
    pixelRatio: number;
    sdf: true;
    stretchX: [number, number][];
    stretchY: [number, number][];
    content: [number, number, number, number];
  };
} {
  const radius = 12 * pixelRatio;
  const buffer = 4 * pixelRatio;
  const width = radius * 2 + 2 + buffer * 2;
  const height = radius * 2 + buffer * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  const left = buffer + radius;
  const right = width - buffer - radius;
  const middleY = height / 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      // Distance to the pill's centre line segment, minus the radius: < 0 inside.
      const cx = Math.min(Math.max(px, left), right);
      const distance = Math.hypot(px - cx, py - middleY) - radius;
      const alpha = 0.75 - distance / (8 * pixelRatio);
      const i = (y * width + x) * 4;
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
    }
  }
  return {
    width,
    height,
    data,
    options: {
      pixelRatio,
      sdf: true,
      stretchX: [[left, right]],
      stretchY: [[buffer + radius - 1, buffer + radius + 1]],
      content: [buffer + radius / 2, buffer, width - buffer - radius / 2, height - buffer],
    },
  };
}
