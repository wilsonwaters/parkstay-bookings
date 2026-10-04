/**
 * The Mapbox controller against a fake `mapbox-gl`: the options it creates the map with, how it
 * loads and fails, and how it turns Explore's calls into sources, feature state, markers and
 * events. (Rendering itself is checked at run time, in Electron.)
 */
import { createMapboxController, STYLE_URL } from './mapboxController';
import { LAYER_IDS, PILL_IMAGE_ID, SOURCE_ID } from './layers';
import type { MapClick, MapControllerOptions, MapTokens } from './types';

type Handler = (event?: unknown) => void;

interface FakeSource {
  setData: jest.Mock;
  getClusterLeaves: jest.Mock;
  getClusterExpansionZoom: jest.Mock;
}

class FakeMap {
  static last: FakeMap;
  options: Record<string, unknown>;
  handlers = new Map<string, Handler[]>();
  controls: { control: { kind: string; options: unknown }; position: string }[] = [];
  sources = new Map<string, FakeSource>();
  layers = new Map<string, unknown>();
  images = new Map<string, unknown>();
  featureState = new Map<string, Record<string, boolean>>();
  rendered: unknown[] = [];
  canvas = document.createElement('canvas');
  touchZoomRotate = { disableRotation: jest.fn() };
  fitBounds = jest.fn();
  flyTo = jest.fn();
  easeTo = jest.fn();
  resize = jest.fn();
  remove = jest.fn();
  zoom = 5;

  constructor(options: Record<string, unknown>) {
    this.options = options;
    FakeMap.last = this;
    // The base style's layers, for the palette.
    for (const id of ['land', 'water', 'landuse']) this.layers.set(id, { id });
  }
  on(event: string, ...rest: unknown[]) {
    const handler = rest[rest.length - 1] as Handler;
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
    return this;
  }
  once(event: string, handler: Handler) {
    const wrapped: Handler = (e) => {
      this.off(event, wrapped);
      handler(e);
    };
    return this.on(event, wrapped);
  }
  off(event: string, handler: Handler) {
    this.handlers.set(
      event,
      (this.handlers.get(event) ?? []).filter((h) => h !== handler)
    );
    return this;
  }
  fire(event: string, data?: unknown) {
    for (const handler of [...(this.handlers.get(event) ?? [])]) handler(data);
  }
  addControl(control: { kind: string; options: unknown }, position: string) {
    this.controls.push({ control, position });
  }
  getCanvas() {
    return this.canvas;
  }
  getSource(id: string) {
    return this.sources.get(id);
  }
  addSource(id: string) {
    this.sources.set(id, {
      setData: jest.fn(),
      getClusterLeaves: jest.fn(),
      getClusterExpansionZoom: jest.fn(),
    });
  }
  getLayer(id: string) {
    return this.layers.get(id);
  }
  addLayer(layer: { id: string }) {
    this.layers.set(layer.id, layer);
  }
  hasImage(id: string) {
    return this.images.has(id);
  }
  addImage(id: string, image: unknown, options: unknown) {
    this.images.set(id, { image, options });
  }
  getPaintProperty() {
    return undefined;
  }
  setPaintProperty() {
    return this;
  }
  setFeatureState({ id }: { id: string }, state: Record<string, boolean>) {
    this.featureState.set(id, { ...this.featureState.get(id), ...state });
  }
  queryRenderedFeatures() {
    return this.rendered;
  }
  getCenter() {
    return { lng: 121, lat: -25 };
  }
  getZoom() {
    return this.zoom;
  }
  getBounds() {
    return { getWest: () => 112, getSouth: () => -36, getEast: () => 130, getNorth: () => -13 };
  }
  /** A flat 0.01° per pixel from 110°E, 10°S, for the canvas-corner area. */
  unproject([x, y]: [number, number]) {
    return { lng: 110 + x * 0.01, lat: -10 - y * 0.01 };
  }
}

class FakeMarker {
  static instances: FakeMarker[] = [];
  options: { element: HTMLElement };
  lngLat: [number, number] | null = null;
  onMap = false;
  constructor(options: { element: HTMLElement }) {
    this.options = options;
    FakeMarker.instances.push(this);
  }
  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  addTo() {
    this.onMap = true;
    return this;
  }
  remove() {
    this.onMap = false;
    return this;
  }
}

class FakePopup {
  static last: FakePopup;
  open = false;
  content: HTMLElement | null = null;
  lngLat: [number, number] | null = null;
  constructor(readonly options: unknown) {
    FakePopup.last = this;
  }
  setLngLat(lngLat: [number, number]) {
    this.lngLat = lngLat;
    return this;
  }
  setDOMContent(content: HTMLElement) {
    this.content = content;
    return this;
  }
  addTo() {
    this.open = true;
    return this;
  }
  remove() {
    this.open = false;
    return this;
  }
  isOpen() {
    return this.open;
  }
}

jest.mock('mapbox-gl', () => {
  const control = (kind: string) =>
    function Control(this: { kind: string; options: unknown }, options: unknown) {
      this.kind = kind;
      this.options = options;
    };
  const module = {
    Map: FakeMap,
    Marker: FakeMarker,
    Popup: FakePopup,
    NavigationControl: control('navigation'),
    AttributionControl: control('attribution'),
  };
  return { __esModule: true, default: module, ...module };
});

const TOKENS: MapTokens = {
  ink: 'token-ink',
  white: 'token-white',
  sand50: 'token-sand-50',
  ocean100: 'token-ocean-100',
  ocean200: 'token-ocean-200',
  eucalypt50: 'token-eucalypt-50',
  eucalypt600: 'token-eucalypt-600',
};

const PLACE = {
  key: 'parkstay:51',
  providerId: 'parkstay',
  externalId: '51',
  name: 'Chapman Pool (formerly Warner Glen at Chapman Pool)',
  kind: 'campground' as const,
  bookingMode: 'online' as const,
  lat: -34.09,
  lng: 115.21,
  imageUrls: [],
  amenities: [],
};

function options(patch: Partial<MapControllerOptions> = {}): MapControllerOptions {
  return {
    container: document.createElement('div'),
    token: 'pk.test',
    camera: null,
    tokens: TOKENS,
    ...patch,
  };
}

/** Creates a controller and lets the fake map finish loading. */
async function loaded(patch: Partial<MapControllerOptions> = {}) {
  const pending = createMapboxController(options(patch));
  await flush();
  FakeMap.last.fire('style.load');
  FakeMap.last.fire('load');
  const controller = await pending;
  return { controller, map: FakeMap.last };
}

/** Lets the dynamic imports resolve. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  FakeMarker.instances = [];
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('createMapboxController', () => {
  it('creates a flat outdoors map of WA, logo and attribution bottom-left, zoom top-right', async () => {
    const { map } = await loaded();
    expect(map.options).toMatchObject({
      accessToken: 'pk.test',
      style: STYLE_URL,
      projection: 'mercator',
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      minZoom: 3,
      logoPosition: 'bottom-left',
      attributionControl: false,
      bounds: [
        [112.5, -35.6],
        [129.2, -13.5],
      ],
      fitBoundsOptions: { padding: 32 },
    });
    expect(STYLE_URL).toBe('mapbox://styles/mapbox/outdoors-v12');
    expect(map.touchZoomRotate.disableRotation).toHaveBeenCalled();
    expect(map.controls.map((c) => [c.control.kind, c.control.options, c.position])).toEqual([
      ['attribution', { compact: true }, 'bottom-left'],
      ['navigation', { showCompass: false }, 'top-right'],
    ]);
  });

  it('starts at a camera from the URL instead of WA', async () => {
    const { map } = await loaded({ camera: { lng: 115, lat: -33, zoom: 9 } });
    expect(map.options).toMatchObject({ center: [115, -33], zoom: 9 });
    expect(map.options).not.toHaveProperty('bounds');
  });

  it('adds the pill image, the clustered source and the four layers when the style loads', async () => {
    const { map } = await loaded();
    expect(map.images.get(PILL_IMAGE_ID)).toMatchObject({ options: { sdf: true } });
    expect(map.sources.has(SOURCE_ID)).toBe(true);
    for (const id of Object.values(LAYER_IDS)) expect(map.layers.has(id)).toBe(true);
  });

  it('fails, and removes the map, when the style cannot load (a refused token)', async () => {
    const pending = createMapboxController(options());
    await flush();
    FakeMap.last.fire('error', {
      error: Object.assign(new Error('Unauthorized'), { status: 401 }),
    });
    await expect(pending).rejects.toThrow("The map couldn't load: Unauthorized");
    expect(FakeMap.last.remove).toHaveBeenCalled();
  });

  it('ignores a tile error after the style has loaded, but not a refused token later', async () => {
    const onFatalError = jest.fn();
    const pending = createMapboxController(options({ onFatalError }));
    await flush();
    const map = FakeMap.last;
    map.fire('style.load');
    map.fire('error', { error: Object.assign(new Error('Not Found'), { status: 404 }) });
    map.fire('load');
    await expect(pending).resolves.toBeDefined();
    map.fire('error', { error: Object.assign(new Error('Forbidden'), { status: 403 }) });
    expect(onFatalError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Mapbox refused the access token' })
    );
  });

  it('removes the map when aborted before it is ready', async () => {
    const abort = new AbortController();
    const pending = createMapboxController(options({ signal: abort.signal }));
    await flush();
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeMap.last.remove).toHaveBeenCalled();
  });

  it('sets the GeoJSON data, and marks the hovered and selected places', async () => {
    const { controller, map } = await loaded();
    controller.setData([PLACE]);
    const source = map.sources.get(SOURCE_ID)!;
    expect(source.setData).toHaveBeenLastCalledWith({
      type: 'FeatureCollection',
      features: [
        expect.objectContaining({
          geometry: { type: 'Point', coordinates: [115.21, -34.09] },
          properties: expect.objectContaining({ key: 'parkstay:51' }),
        }),
      ],
    });

    controller.setHovered(PLACE.key);
    expect(map.featureState.get(PLACE.key)).toEqual({ hover: true });
    const [marker] = FakeMarker.instances;
    expect(marker.onMap).toBe(true);
    expect(marker.lngLat).toEqual([115.21, -34.09]);
    expect(marker.options.element.textContent).toBe('Chapman Pool (formerly…');
    expect(marker.options.element).toHaveAttribute('aria-hidden', 'true');

    controller.setSelected(PLACE.key);
    controller.setHovered(null);
    expect(map.featureState.get(PLACE.key)).toEqual({ hover: false, selected: true });
    expect(marker.onMap).toBe(true);
    controller.setSelected(null);
    expect(marker.onMap).toBe(false);
  });

  it('reports clicks on a place, several places, or empty map', async () => {
    const { controller, map } = await loaded();
    const clicks: MapClick[] = [];
    controller.onFeatureClick((click) => clicks.push(click));
    const point = { point: { x: 1, y: 2 }, lngLat: { lng: 115, lat: -33 } };
    const feature = (key: string) => ({
      layer: { id: LAYER_IDS.dot },
      properties: { key },
      geometry: { type: 'Point', coordinates: [115, -33] },
    });

    map.rendered = [feature('a:1'), { ...feature('a:1'), layer: { id: LAYER_IDS.pill } }];
    map.fire('click', point);
    map.rendered = [feature('a:1'), feature('a:2')];
    map.fire('click', point);
    map.rendered = [];
    map.fire('click', point);
    expect(clicks).toEqual([
      { type: 'location', key: 'a:1' },
      { type: 'locations', keys: ['a:1', 'a:2'], lng: 115, lat: -33 },
      { type: 'empty' },
    ]);
  });

  it('zooms into a cluster, or lists its places when they share one spot', async () => {
    const { controller, map } = await loaded();
    const clicks: MapClick[] = [];
    controller.onFeatureClick((click) => clicks.push(click));
    const source = map.sources.get(SOURCE_ID)!;
    const cluster = {
      layer: { id: LAYER_IDS.clusters },
      properties: { cluster_id: 7, point_count: 2 },
      geometry: { type: 'Point', coordinates: [120, -30] },
    };
    const leaf = (key: string, coordinates: [number, number]) => ({
      properties: { key },
      geometry: { type: 'Point', coordinates },
    });
    map.rendered = [cluster];

    source.getClusterLeaves.mockImplementation((_id, _limit, _offset, callback) =>
      callback(null, [leaf('a:1', [120, -30]), leaf('a:2', [121, -31])])
    );
    source.getClusterExpansionZoom.mockImplementation((_id, callback) => callback(null, 8));
    map.fire('click', { point: { x: 0, y: 0 }, lngLat: { lng: 120, lat: -30 } });
    expect(map.easeTo).toHaveBeenCalledWith({ center: [120, -30], zoom: 8 });

    source.getClusterLeaves.mockImplementation((_id, _limit, _offset, callback) =>
      callback(null, [leaf('a:1', [120, -30]), leaf('a:2', [120, -30])])
    );
    map.fire('click', { point: { x: 0, y: 0 }, lngLat: { lng: 120, lat: -30 } });
    expect(clicks).toEqual([{ type: 'locations', keys: ['a:1', 'a:2'], lng: 120, lat: -30 }]);
  });

  it('reports the hovered place, and the end of moves with who moved the map', async () => {
    const { controller, map } = await loaded();
    const hovers: (string | null)[] = [];
    controller.onFeatureHover((key) => hovers.push(key));
    map.rendered = [{ layer: { id: LAYER_IDS.pill }, properties: { key: 'a:1' }, geometry: {} }];
    map.fire('mousemove', { point: { x: 0, y: 0 } });
    map.fire('mousemove', { point: { x: 1, y: 0 } });
    map.rendered = [];
    map.fire('mousemove', { point: { x: 9, y: 9 } });
    expect(hovers).toEqual(['a:1', null]);

    const views: unknown[] = [];
    controller.onMoveEnd((view) => views.push(view));
    map.fire('moveend', { originalEvent: new MouseEvent('mouseup') });
    map.fire('moveend', {});
    expect(views).toEqual([
      { camera: { lng: 121, lat: -25, zoom: 5 }, bbox: [112, -36, 130, -13], userInitiated: true },
      { camera: { lng: 121, lat: -25, zoom: 5 }, bbox: [112, -36, 130, -13], userInitiated: false },
    ]);
  });

  it('reports the whole canvas as the map area, not the bounds inside the camera padding', async () => {
    const { controller, map } = await loaded();
    Object.defineProperty(map.canvas, 'clientWidth', { configurable: true, value: 600 });
    Object.defineProperty(map.canvas, 'clientHeight', { configurable: true, value: 400 });
    expect(controller.getView().bbox).toEqual([110, -14, 116, -10]);
  });

  it('fits results up to zoom 11, flies in, shows popups and cleans up', async () => {
    const { controller, map } = await loaded();
    controller.fitBounds([115, -34, 116, -33]);
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [115, -34],
        [116, -33],
      ],
      { padding: 48, maxZoom: 11 }
    );
    controller.flyTo({ lng: 115, lat: -33 });
    expect(map.flyTo).toHaveBeenCalledWith({ center: [115, -33], zoom: 12 });

    const content = document.createElement('div');
    controller.showPopup({ lng: 115, lat: -33 }, content);
    expect(FakePopup.last.open).toBe(true);
    expect(FakePopup.last.content).toBe(content);
    expect(FakePopup.last.lngLat).toEqual([115, -33]);
    controller.hidePopup();
    expect(FakePopup.last.open).toBe(false);

    controller.destroy();
    expect(map.remove).toHaveBeenCalledTimes(1);
    controller.destroy();
    expect(map.remove).toHaveBeenCalledTimes(1);
  });
});
