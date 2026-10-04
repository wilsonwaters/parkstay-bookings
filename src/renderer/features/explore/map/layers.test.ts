import {
  ACTIVE,
  buildLayers,
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS,
  LAYER_IDS,
  MAP_FONT,
  PILL_IMAGE_ID,
  pillImage,
  SOURCE_ID,
  SOURCE_SPEC,
} from './layers';
import type { MapTokens } from './types';

const TOKENS: MapTokens = {
  ink: 'token-ink',
  white: 'token-white',
  sand50: 'token-sand-50',
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

  it('adds clusters, counts, dots and pills, bottom to top, all on the one source', () => {
    const layers = buildLayers(TOKENS);
    expect(layers.map((l) => l.id)).toEqual([
      'clusters',
      'cluster-count',
      'location-dot',
      'location-pill',
    ]);
    expect(layers.every((l) => l.source === SOURCE_ID)).toBe(true);
  });

  it('splits clustered from single places with the point_count filter', () => {
    const [clusters, count, dot, pill] = buildLayers(TOKENS);
    expect(clusters.filter).toEqual(['has', 'point_count']);
    expect(count.filter).toEqual(['has', 'point_count']);
    expect(dot.filter).toEqual(['!', ['has', 'point_count']]);
    expect(pill.filter).toEqual(['!', ['has', 'point_count']]);
  });

  it('draws clusters white with an ink outline and count, larger as they grow', () => {
    const [clusters, count] = buildLayers(TOKENS);
    expect(clusters.paint).toMatchObject({
      'circle-color': TOKENS.white,
      'circle-stroke-color': TOKENS.ink,
      'circle-stroke-width': 1.5,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 22],
    });
    expect(count.layout).toMatchObject({
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': MAP_FONT,
    });
    expect(count.paint).toEqual({ 'text-color': TOKENS.ink });
  });

  it('turns a dot ink and larger while hovered or selected', () => {
    const dot = buildLayers(TOKENS)[2];
    expect(ACTIVE).toEqual([
      'any',
      ['boolean', ['feature-state', 'hover'], false],
      ['boolean', ['feature-state', 'selected'], false],
    ]);
    expect(dot.paint).toEqual({
      'circle-color': ['case', ACTIVE, TOKENS.ink, TOKENS.white],
      'circle-stroke-color': ['case', ACTIVE, TOKENS.white, TOKENS.ink],
      'circle-stroke-width': 2,
      'circle-radius': ['case', ACTIVE, 8, 5],
    });
  });

  it('shows name pills from zoom 8 on a stretchable SDF pill, swapping to ink when active', () => {
    const pill = buildLayers(TOKENS)[3];
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
