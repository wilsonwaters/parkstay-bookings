/**
 * Recolours Mapbox's `outdoors-v12` style to WA Stay's palette at run time: sand land, soft
 * ocean water, eucalypt parks, quieter terrain. Outdoors is used for its park boundaries,
 * hillshade and unsealed tracks (most places are in national parks); the layer ids it has are
 * listed in docs/design/map.md.
 *
 * Every change is guarded by `getLayer`: a layer Mapbox renames or drops is skipped (and
 * logged once in development), never an error.
 */

import type { MapTokens } from './types';

// Vite replaces `process.env.NODE_ENV` in renderer code; Jest runs on Node (as in ui/dev.ts).
declare const process: { env: { NODE_ENV?: string } };

/** The few map calls the palette needs, so tests can pass a fake. */
export interface PaletteMap {
  getLayer(id: string): unknown;
  getPaintProperty(layer: string, name: string): unknown;
  setPaintProperty(layer: string, name: string, value: unknown): unknown;
}

/** A design token's RGB channels (`--ws-sand-50: 250 247 242`) as a CSS colour Mapbox reads. */
export function tokenColour(channels: string): string {
  const [r, g, b] = channels
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return `rgb(${r}, ${g}, ${b})`;
}

/** The map's colours, read from the design tokens on the page. */
export function readMapTokens(root: Element = document.documentElement): MapTokens {
  const style = getComputedStyle(root);
  const read = (name: string) => tokenColour(style.getPropertyValue(`--ws-${name}`));
  return {
    ink: read('ink-900'),
    white: read('sand-0'),
    sand50: read('sand-50'),
    ocean100: read('ocean-100'),
    ocean200: read('ocean-200'),
    eucalypt50: read('eucalypt-50'),
    eucalypt600: read('eucalypt-600'),
  };
}

/**
 * Replaces the output for `park` in every `["match", ["get", "class"], …]` inside an
 * expression, leaving every other class as Mapbox drew it. Zoom interpolations are walked into,
 * so the result stays a valid zoom expression.
 */
export function recolourClass(expression: unknown, className: string, colour: string): unknown {
  if (!Array.isArray(expression)) return expression;
  const [op, input] = expression;
  if (op === 'match' && Array.isArray(input) && input[0] === 'get' && input[1] === 'class') {
    const out = [...expression];
    // Label/output pairs sit between the input and the fallback.
    for (let i = 2; i < out.length - 1; i += 2) {
      const label = out[i];
      const matches = Array.isArray(label) ? label.includes(className) : label === className;
      if (matches) out[i + 1] = colour;
    }
    return out;
  }
  return expression.map((part) => recolourClass(part, className, colour));
}

type Rule = {
  layer: string;
  property: string;
  value: (tokens: MapTokens, current: unknown) => unknown;
};

/** What changes, layer by layer. */
export const PALETTE_RULES: Rule[] = [
  { layer: 'land', property: 'background-color', value: (t) => t.sand50 },
  { layer: 'water', property: 'fill-color', value: (t) => t.ocean100 },
  // Bathymetry shades the sea a deeper blue at the zooms WA is seen at, hiding ocean-100.
  { layer: 'water-depth', property: 'fill-opacity', value: () => 0 },
  { layer: 'water-shadow', property: 'fill-color', value: (t) => t.ocean200 },
  { layer: 'waterway', property: 'line-color', value: (t) => t.ocean200 },
  { layer: 'waterway-shadow', property: 'line-color', value: (t) => t.ocean200 },
  // Vegetation (wood, scrub, grass, crop) keeps its shapes but at a third of its strength, so
  // Mapbox's bright greens never outshout the pins.
  {
    layer: 'landcover',
    property: 'fill-opacity',
    value: () => ['interpolate', ['linear'], ['zoom'], 4, 0.3, 8, 0.25, 12, 0],
  },
  // National parks: a solid eucalypt wash (Mapbox fades it to 20%, which would vanish on sand),
  // edged by a soft eucalypt band so the boundary reads at every zoom.
  { layer: 'national-park', property: 'fill-color', value: (t) => t.eucalypt50 },
  {
    layer: 'national-park',
    property: 'fill-opacity',
    value: () => ['interpolate', ['linear'], ['zoom'], 5, 0, 6, 1],
  },
  { layer: 'national-park_tint-band', property: 'line-color', value: (t) => t.eucalypt600 },
  { layer: 'national-park_tint-band', property: 'line-opacity', value: () => 0.3 },
  {
    layer: 'landuse',
    property: 'fill-color',
    value: (t, current) => recolourClass(current, 'park', t.eucalypt50),
  },
  // Outdoors draws hillshade as a fill layer (not a raster with an exaggeration), so it is
  // quietened with opacity: half strength, the equivalent of exaggeration 0.25.
  { layer: 'hillshade', property: 'fill-opacity', value: () => 0.5 },
  { layer: 'contour-line', property: 'line-opacity', value: () => 0.3 },
  { layer: 'contour-label', property: 'text-opacity', value: () => 0.3 },
];

const reported = new Set<string>();

/**
 * Applies the palette. Run it on every `style.load`. Returns the layers it could not find.
 */
export function applyWaPalette(map: PaletteMap, tokens: MapTokens): string[] {
  const missing: string[] = [];
  for (const rule of PALETTE_RULES) {
    if (!map.getLayer(rule.layer)) {
      missing.push(rule.layer);
      continue;
    }
    try {
      const current = map.getPaintProperty(rule.layer, rule.property);
      map.setPaintProperty(rule.layer, rule.property, rule.value(tokens, current));
    } catch {
      missing.push(rule.layer);
    }
  }
  if (process.env.NODE_ENV !== 'production') {
    const fresh = missing.filter((id) => !reported.has(id));
    fresh.forEach((id) => reported.add(id));
    if (fresh.length) {
      console.warn(`[map] The base style has no ${fresh.join(', ')} layer; left as it is.`);
    }
  }
  return missing;
}
