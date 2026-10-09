import {
  ACTIVE,
  buildLayers,
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS,
  LAYER_IDS,
  MAP_FONT_BOLD,
  PILL_IMAGE_ID,
  PREVIEWED,
  pillImage,
  SOURCE_ID,
  SOURCE_SPEC,
} from './layers';
import type { MapTokens } from './types';

const TOKENS: MapTokens = {
  ink: 'token-ink',
  ink700: 'token-ink-700',
  white: 'token-white',
  sand50: 'token-sand-50',
  sand200: 'token-sand-200',
  sand500: 'token-sand-500',
  ocean100: 'token-ocean-100',
  ocean200: 'token-ocean-200',
  eucalypt50: 'token-eucalypt-50',
  eucalypt600: 'token-eucalypt-600',
};

describe('map source and layers', () => {
  it('clusters within 48 px up to zoom 10, keyed by location key', () => {
    expect(SOURCE_SPEC).toMatchObject({
      type: 'geojson',
      promoteId: 'key',
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 10,
    });
    expect([CLUSTER_RADIUS, CLUSTER_MAX_ZOOM]).toEqual([48, 10]);
  });

  it('adds clusters, counts, halos, pins and pills, bottom to top, all on the one source', () => {
    const layers = buildLayers(TOKENS);
    expect(layers.map((l) => l.id)).toEqual([
      'clusters',
      'cluster-count',
      'location-halo',
      'location-dot',
      'location-pill',
    ]);
    expect(layers.every((l) => l.source === SOURCE_ID)).toBe(true);
  });

  it('splits clustered from single places with the point_count filter', () => {
    const [clusters, count, halo, dot, pill] = buildLayers(TOKENS);
    expect(clusters.filter).toEqual(['has', 'point_count']);
    expect(count.filter).toEqual(['has', 'point_count']);
    expect(halo.filter).toEqual(['!', ['has', 'point_count']]);
    expect(dot.filter).toEqual(['!', ['has', 'point_count']]);
    expect(pill.filter).toEqual(['!', ['has', 'point_count']]);
  });

  it('fills clusters ink with a white ring and a bold white count, larger as they grow', () => {
    const [clusters, count] = buildLayers(TOKENS);
    expect(clusters.paint).toMatchObject({
      'circle-color': TOKENS.ink,
      'circle-stroke-color': TOKENS.white,
      'circle-stroke-width': 2,
      'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 23],
    });
    expect(count.layout).toMatchObject({
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': MAP_FONT_BOLD,
    });
    expect(count.paint).toEqual({ 'text-color': TOKENS.white });
  });

  it('fills every pin ink with a white ring, larger with a soft halo while hovered or selected', () => {
    const [, , halo, dot] = buildLayers(TOKENS);
    expect(ACTIVE).toEqual([
      'any',
      ['boolean', ['feature-state', 'hover'], false],
      ['boolean', ['feature-state', 'selected'], false],
    ]);
    expect(dot.paint).toEqual({
      'circle-color': TOKENS.ink,
      'circle-stroke-color': TOKENS.white,
      'circle-stroke-width': ['case', ACTIVE, 3, 2],
      'circle-radius': ['case', ACTIVE, 9, 6],
    });
    expect(halo.paint).toEqual({
      'circle-color': TOKENS.ink,
      'circle-opacity': 0.16,
      'circle-radius': ['case', ACTIVE, 16, 0],
    });
  });

  it('uses only ink and white, so pins outrank everything on the base map', () => {
    const colours = new Set<unknown>();
    for (const layer of buildLayers(TOKENS)) {
      for (const [name, value] of Object.entries(layer.paint ?? {})) {
        if (!name.endsWith('color')) continue;
        const values = Array.isArray(value) ? value.slice(-2) : [value];
        values.forEach((v) => colours.add(v));
      }
    }
    expect([...colours].sort()).toEqual([TOKENS.ink, TOKENS.white].sort());
  });

  it('shows name pills from zoom 8 on a stretchable SDF pill, swapping to ink when active', () => {
    const pill = buildLayers(TOKENS)[4];
    expect(pill.minzoom).toBe(8);
    expect(pill.layout).toMatchObject({
      'text-field': ['get', 'label'],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-size': 12,
      'icon-image': PILL_IMAGE_ID,
      'icon-text-fit': 'both',
    });
    // Pills collide (the default): overlapping ones hide, their dots stay.
    expect(pill.layout).not.toHaveProperty('text-allow-overlap');
    expect(pill.paint).toMatchObject({
      'icon-color': ['case', ACTIVE, TOKENS.ink, TOKENS.white],
      'text-color': ['case', ACTIVE, TOKENS.white, TOKENS.ink],
      'icon-halo-color': TOKENS.ink,
    });
    expect(LAYER_IDS.pill).toBe('location-pill');
  });

  it('hides the pill of a place while its preview is open', () => {
    const pill = buildLayers(TOKENS)[4];
    expect(PREVIEWED).toEqual(['boolean', ['feature-state', 'previewed'], false]);
    expect(pill.paint).toMatchObject({
      'icon-opacity': ['case', PREVIEWED, 0, 1],
      'text-opacity': ['case', PREVIEWED, 0, 1],
    });
  });

  it('draws the pill as a distance field: solid inside, 0.75 on the edge, fading outside', () => {
    const image = pillImage(2);
    const alpha = (x: number, y: number) => image.data[(y * image.width + x) * 4 + 3] / 255;
    const middleY = Math.floor(image.height / 2);
    expect(alpha(Math.floor(image.width / 2), middleY)).toBe(1);
    expect(alpha(0, 0)).toBe(0);
    // The top edge of the pill is `buffer` (8 px at ratio 2) from the top.
    expect(alpha(Math.floor(image.width / 2), 8)).toBeCloseTo(0.75, 1);
    expect(image.options).toMatchObject({ sdf: true, pixelRatio: 2 });
    const [[stretchStart, stretchEnd]] = image.options.stretchX;
    expect(stretchEnd).toBeGreaterThan(stretchStart);
  });
});
