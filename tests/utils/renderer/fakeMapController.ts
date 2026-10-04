/**
 * A `MapController` for tests: records what Explore asks of the map and lets a test play the
 * map's part (a pin hovered or clicked, the map moved), so no mapbox-gl or WebGL is needed.
 *
 *   jest.mock('…/map/mapSupport', () => ({ detectMapSupport: () => ({ available: true, token: 'pk.test' }) }));
 *   jest.mock('…/map/mapboxController', () => ({ createMapboxController: jest.fn() }));
 *   const maps = installFakeMap(jest.mocked(createMapboxController));
 *   …
 *   maps.current.emitClick({ type: 'location', key: 'parkstay:20' });
 */

import { act } from '@testing-library/react';
import type { BoundingBox, LocationSummary } from '../../../src/shared/types/catalog.types';
import type {
  CreateMapController,
  MapClick,
  MapController,
  MapControllerOptions,
  MapViewState,
} from '../../../src/renderer/features/explore/map/types';

export const WA_VIEW: MapViewState = {
  camera: { lng: 120.85, lat: -24.55, zoom: 4.2 },
  bbox: [112.5, -35.6, 129.2, -13.5],
  userInitiated: false,
};

export const KIMBERLEY_BBOX: BoundingBox = [121.5, -19.5, 129, -14];

export class FakeMapController implements MapController {
  readonly options: MapControllerOptions;
  data: LocationSummary[] = [];
  setDataCalls = 0;
  hovered: string | null = null;
  selected: string | null = null;
  fits: { bbox: BoundingBox; maxZoom?: number }[] = [];
  flights: { lng: number; lat: number; zoom?: number }[] = [];
  resizes = 0;
  destroyed = false;
  view: MapViewState = WA_VIEW;
  /** Where the popup's content is shown, in the document so tests can find it. */
  readonly popupHost: HTMLDivElement;
  popupAt: { lng: number; lat: number } | null = null;

  private moveListeners = new Set<(view: MapViewState) => void>();
  private hoverListeners = new Set<(key: string | null) => void>();
  private clickListeners = new Set<(click: MapClick) => void>();

  constructor(options: MapControllerOptions) {
    this.options = options;
    this.popupHost = document.createElement('div');
    this.popupHost.dataset.fakeMapPopup = '';
    // Inside the map container, as Mapbox puts its popups.
    options.container.appendChild(this.popupHost);
  }

  setData(items: readonly LocationSummary[]) {
    this.data = [...items];
    this.setDataCalls += 1;
  }
  setHovered(key: string | null) {
    this.hovered = key;
  }
  setSelected(key: string | null) {
    this.selected = key;
  }
  fitBounds(bbox: BoundingBox, options: { maxZoom?: number } = {}) {
    this.fits.push({ bbox, maxZoom: options.maxZoom });
  }
  flyTo(target: { lng: number; lat: number; zoom?: number }) {
    this.flights.push(target);
  }
  onMoveEnd(listener: (view: MapViewState) => void) {
    this.moveListeners.add(listener);
    return () => this.moveListeners.delete(listener);
  }
  onFeatureHover(listener: (key: string | null) => void) {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }
  onFeatureClick(listener: (click: MapClick) => void) {
    this.clickListeners.add(listener);
    return () => this.clickListeners.delete(listener);
  }
  showPopup(at: { lng: number; lat: number }, content: HTMLElement) {
    this.popupAt = at;
    if (content.parentElement !== this.popupHost) this.popupHost.replaceChildren(content);
  }
  hidePopup() {
    this.popupAt = null;
    this.popupHost.replaceChildren();
  }
  getView() {
    return this.view;
  }
  resize() {
    this.resizes += 1;
  }
  destroy() {
    this.destroyed = true;
    this.popupHost.remove();
  }

  /** The map stopped moving at `bbox` (a person moved it unless `userInitiated` is false). */
  emitMove(bbox: BoundingBox, userInitiated = true) {
    const [west, south, east, north] = bbox;
    this.view = {
      camera: { lng: (west + east) / 2, lat: (south + north) / 2, zoom: 6 },
      bbox,
      userInitiated,
    };
    act(() => {
      for (const listener of [...this.moveListeners]) listener(this.view);
    });
  }
  emitHover(key: string | null) {
    act(() => {
      for (const listener of [...this.hoverListeners]) listener(key);
    });
  }
  emitClick(click: MapClick) {
    act(() => {
      for (const listener of [...this.clickListeners]) listener(click);
    });
  }
}

export interface FakeMaps {
  /** Every controller created, in order. */
  all: FakeMapController[];
  /** The latest one. */
  readonly current: FakeMapController;
}

/** Makes the mocked `createMapboxController` build FakeMapControllers. */
export function installFakeMap(create: jest.MockedFunction<CreateMapController>): FakeMaps {
  const all: FakeMapController[] = [];
  create.mockClear();
  create.mockImplementation(async (options) => {
    const controller = new FakeMapController(options);
    all.push(controller);
    return controller;
  });
  return {
    all,
    get current() {
      const latest = all[all.length - 1];
      if (!latest) throw new Error('No map was created');
      return latest;
    },
  };
}
