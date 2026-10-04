import type { BoundingBox, LocationSummary } from '../../../../shared/types/catalog.types';
import type { MapCamera } from '../state/exploreParams';

export type { MapCamera };

/** Where the map is looking, reported when it stops moving. */
export interface MapViewState {
  camera: MapCamera;
  /** `[west, south, east, north]` of what is visible. */
  bbox: BoundingBox;
  /** The person moved the map (drag, wheel, keys), rather than code (a fit or a fly-to). */
  userInitiated: boolean;
}

export type MapClick =
  /** A location's dot or pill. */
  | { type: 'location'; key: string }
  /**
   * Several places that zooming cannot separate (a cluster at its last zoom, or places on the
   * same spot): show them as a list.
   */
  | { type: 'locations'; keys: string[]; lng: number; lat: number }
  /** Empty map. */
  | { type: 'empty' };

/** The colours the map is drawn with, as CSS colours read from the design tokens. */
export interface MapTokens {
  /** ink-900: cluster and dot outlines, hovered pins, text. */
  ink: string;
  /** sand-0: pin fill, text on ink. */
  white: string;
  /** sand-50: land. */
  sand50: string;
  /** ocean-100: water. */
  ocean100: string;
  /** ocean-200: rivers and creeks. */
  ocean200: string;
  /** eucalypt-50: national parks and parks. */
  eucalypt50: string;
  /** eucalypt-600: national park edges, faint. */
  eucalypt600: string;
}

/**
 * Everything Explore asks of the map. `mapboxController.ts` implements it with Mapbox GL;
 * tests use a fake. Data and highlight calls are cheap to repeat.
 */
export interface MapController {
  /** Replaces the places shown. */
  setData(items: readonly LocationSummary[]): void;
  setHovered(key: string | null): void;
  setSelected(key: string | null): void;
  fitBounds(bbox: BoundingBox, options?: { maxZoom?: number }): void;
  flyTo(target: { lng: number; lat: number; zoom?: number }): void;
  /** Subscribes to the end of every move; returns an unsubscribe. */
  onMoveEnd(listener: (view: MapViewState) => void): () => void;
  /** The location under the pointer, or null when it leaves. */
  onFeatureHover(listener: (key: string | null) => void): () => void;
  onFeatureClick(listener: (click: MapClick) => void): () => void;
  /** Shows `content` in a popup above a point (the preview, or a list of places). */
  showPopup(at: { lng: number; lat: number }, content: HTMLElement): void;
  hidePopup(): void;
  getView(): MapViewState;
  /** Fits the map to its container again, after the container was hidden or resized. */
  resize(): void;
  destroy(): void;
}

export interface MapControllerOptions {
  container: HTMLElement;
  /** A public `pk.` token. */
  token: string;
  /** Where to start; WA when null. */
  camera: MapCamera | null;
  tokens: MapTokens;
  /** Aborting before the map is ready removes it and rejects. */
  signal?: AbortSignal;
  /** The map stopped working after it loaded (the token was rejected). */
  onFatalError?: (error: Error) => void;
}

export type CreateMapController = (options: MapControllerOptions) => Promise<MapController>;
