import {
  applyWaPalette,
  PALETTE_RULES,
  readMapTokens,
  recolourClass,
  tokenColour,
  type PaletteMap,
} from './waPalette';
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

/** A map that has some layers, records every change and can be told to fail. */
function fakeMap(layers: string[], failOn: string[] = []) {
  const paint = new Map<string, unknown>([
    [
      'landuse/fill-color',
      [
        'interpolate',
        ['linear'],
        ['zoom'],
        15,
        ['match', ['get', 'class'], 'wood', 'green', 'park', 'old-park', ['school'], 'tan', 'grey'],
        16,
        ['match', ['get', 'class'], ['park', 'pitch'], 'old-park', 'grey'],
      ],
    ],
  ]);
  const map: PaletteMap & { paint: Map<string, unknown> } = {
    paint,
    getLayer: (id) => (layers.includes(id) ? { id } : undefined),
    getPaintProperty: (layer, name) => paint.get(`${layer}/${name}`),
    setPaintProperty: (layer, name, value) => {
      if (failOn.includes(layer)) throw new Error(`cannot paint ${layer}`);
      paint.set(`${layer}/${name}`, value);
    },
  };
  return map;
}

describe('applyWaPalette', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('recolours land, water, parks and quietens terrain with the design tokens', () => {
    const map = fakeMap(PALETTE_RULES.map((r) => r.layer));
    expect(applyWaPalette(map, TOKENS)).toEqual([]);
    expect(map.paint.get('land/background-color')).toBe(TOKENS.sand50);
    expect(map.paint.get('water/fill-color')).toBe(TOKENS.ocean100);
    expect(map.paint.get('waterway/line-color')).toBe(TOKENS.ocean200);
    expect(map.paint.get('water-depth/fill-opacity')).toBe(0);
    expect(map.paint.get('national-park/fill-color')).toBe(TOKENS.eucalypt50);
    expect(map.paint.get('national-park/fill-opacity')).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      0,
      6,
      1,
    ]);
    expect(map.paint.get('national-park_tint-band/line-color')).toBe(TOKENS.eucalypt600);
    // Vegetation keeps Mapbox's shapes and colours at a third of the strength.
    expect(map.paint.get('landcover/fill-opacity')).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      4,
      0.3,
      8,
      0.25,
      12,
      0,
    ]);
    expect(map.paint.get('hillshade/fill-opacity')).toBe(0.5);
    expect(map.paint.get('contour-line/line-opacity')).toBe(0.3);
    expect(map.paint.get('contour-label/text-opacity')).toBe(0.3);
  });

  it('turns only the park class of landuse eucalypt, at every zoom stop', () => {
    const map = fakeMap(['landuse']);
    applyWaPalette(map, TOKENS);
    expect(map.paint.get('landuse/fill-color')).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      15,
      [
        'match',
        ['get', 'class'],
        'wood',
        'green',
        'park',
        TOKENS.eucalypt50,
        ['school'],
        'tan',
        'grey',
      ],
      16,
      ['match', ['get', 'class'], ['park', 'pitch'], TOKENS.eucalypt50, 'grey'],
    ]);
  });

  it('skips layers the style does not have, or refuses, without throwing, and warns once', () => {
    const map = fakeMap(['land', 'water', 'contour-line'], ['contour-line']);
    const missing = applyWaPalette(map, TOKENS);
    expect(missing).toContain('national-park');
    expect(missing).toContain('contour-line');
    expect(missing).not.toContain('land');
    expect(map.paint.get('land/background-color')).toBe(TOKENS.sand50);
    expect(console.warn).toHaveBeenCalledTimes(1);
    applyWaPalette(map, TOKENS);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('leaves values that are not class matches alone', () => {
    expect(recolourClass('red', 'park', 'blue')).toBe('red');
    expect(recolourClass(['match', ['get', 'type'], 'park', 'a', 'b'], 'park', 'c')).toEqual([
      'match',
      ['get', 'type'],
      'park',
      'a',
      'b',
    ]);
  });
});

describe('map tokens', () => {
  it('turns token channels into a CSS colour Mapbox reads', () => {
    expect(tokenColour(' 250 247 242')).toBe('rgb(250, 247, 242)'); // token-guard-ignore: the conversion under test
  });

  it('reads the colours from the design tokens on the page', () => {
    const root = document.documentElement;
    const values: Record<string, string> = {
      'ink-900': '21 24 29',
      'sand-0': '255 255 255',
      'sand-50': '250 247 242',
      'ocean-100': '214 229 245',
      'ocean-200': '174 203 234',
      'eucalypt-50': '234 243 238',
      'eucalypt-600': '45 115 86',
    };
    for (const [name, value] of Object.entries(values))
      root.style.setProperty(`--ws-${name}`, value);
    expect(readMapTokens(root)).toEqual({
      ink: tokenColour(values['ink-900']),
      white: tokenColour(values['sand-0']),
      sand50: tokenColour(values['sand-50']),
      ocean100: tokenColour(values['ocean-100']),
      ocean200: tokenColour(values['ocean-200']),
      eucalypt50: tokenColour(values['eucalypt-50']),
      eucalypt600: tokenColour(values['eucalypt-600']),
    });
  });
});
