import { boundsOf, hasMapLocation, pillLabel, toFeatureCollection, withinBbox } from './geo';

const at = (lng: number, lat: number) => ({ lng, lat });

describe('map geometry', () => {
  it('keeps places with no real position off the map: NaN, out of range, or 0,0', () => {
    expect(hasMapLocation(at(115.86, -31.95))).toBe(true);
    expect(hasMapLocation(at(Number.NaN, -31.95))).toBe(false);
    expect(hasMapLocation(at(115.86, Number.POSITIVE_INFINITY))).toBe(false);
    expect(hasMapLocation(at(0, 0))).toBe(false);
    expect(hasMapLocation(at(190, -31))).toBe(false);
    expect(hasMapLocation(at(0, -31))).toBe(true);
  });

  it('tests a place against a box, edges included', () => {
    const wa = [112.5, -35.6, 129.2, -13.5] as const;
    expect(withinBbox(at(115.86, -31.95), [...wa])).toBe(true);
    expect(withinBbox(at(112.5, -35.6), [...wa])).toBe(true);
    expect(withinBbox(at(130, -20), [...wa])).toBe(false);
    expect(withinBbox(at(120, -36), [...wa])).toBe(false);
    expect(withinBbox(at(0, 0), [-1, -1, 1, 1])).toBe(false);
  });

  it('handles a box across the antimeridian', () => {
    expect(withinBbox(at(179.5, 0.5), [179, -1, -179, 1])).toBe(true);
    expect(withinBbox(at(-179.5, 0.5), [179, -1, -179, 1])).toBe(true);
    expect(withinBbox(at(0, 0.5), [179, -1, -179, 1])).toBe(false);
  });

  it('bounds only the places that have a position', () => {
    expect(boundsOf([at(115, -32), at(122, -18), at(0, 0), at(Number.NaN, 1)])).toEqual([
      115, -32, 122, -18,
    ]);
    expect(boundsOf([at(0, 0)])).toBeNull();
    expect(boundsOf([])).toBeNull();
  });

  it('builds GeoJSON points keyed by location key, dropping places with no position', () => {
    const collection = toFeatureCollection([
      { key: 'parkstay:20', name: 'Bungarra', lng: 113.84, lat: -22.247 },
      { key: 'parkstay:21', name: 'Nowhere', lng: 0, lat: 0 },
      { key: 'parkstay:22', name: 'Broken', lng: Number.NaN, lat: -22 },
    ]);
    expect(collection).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [113.84, -22.247] },
          properties: { key: 'parkstay:20', name: 'Bungarra', label: 'Bungarra' },
        },
      ],
    });
  });

  it('cuts long names to 22 characters for the map pill, keeping the full name', () => {
    // 51 characters, ParkStay's longest name.
    const name = 'Chapman Pool (formerly Warner Glen at Chapman Pool)';
    expect(name).toHaveLength(51);
    expect(pillLabel(name)).toBe('Chapman Pool (formerly…');
    expect(Array.from(pillLabel(name)).length).toBeLessThanOrEqual(23);
    expect(pillLabel('Lucky Bay')).toBe('Lucky Bay');
    const [feature] = toFeatureCollection([{ key: 'k:1', name, lng: 115, lat: -34 }]).features;
    expect(feature.properties.name).toBe(name);
  });
});
