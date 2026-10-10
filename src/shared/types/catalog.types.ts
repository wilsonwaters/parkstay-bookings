/**
 * Location catalogue types shared by main and renderer (architecture-notes §3, §12.15–§12.17).
 *
 * A location is identified across providers by its key, `${providerId}:${externalId}`
 * (`shared/utils/location-key.ts`). No node or electron imports.
 */

import { z } from 'zod';
import { assertTypeEquals, type Simplify } from '../utils/type-equality';
import {
  BookingModeSchema,
  LocationKindSchema,
  ProviderIdSchema,
  type BookingMode,
  type BulkAvailabilityEntry,
  type LocationKind,
  type ProviderId,
} from './provider.types';

export interface LocationSummary {
  /** `${providerId}:${externalId}` */
  key: string;
  providerId: ProviderId;
  externalId: string;
  name: string;
  kind: LocationKind;
  bookingMode: BookingMode;
  lat: number;
  lng: number;
  area?: { name: string; region?: string };
  summary?: string;
  /** Absolute https URLs. */
  imageUrls: string[];
  amenities: string[];
  unitCount?: number;
  infoUrl?: string;
  /** A date-less booking link. Prefer `LocationAvailability.bookingUrl` once dates are known. */
  bookingUrl?: string;
}

/** An individually bookable unit (site, cabin, room). Same naming as `UnitAvailability` (§12.16). */
export interface UnitSummary {
  unitId: string;
  unitName: string;
  unitType?: string;
  maxPeople?: number;
  maxVehicles?: number;
  equipment?: string[];
  amenities?: string[];
  description?: string;
}

export interface LocationDetail extends LocationSummary {
  /** Sanitised in main before it crosses IPC. */
  descriptionHtml?: string;
  units: UnitSummary[];
  /** A human sentence, e.g. "Bookings open 180 days ahead at midnight AWST". */
  releaseInfo?: string;
  /** ISO timestamp the detail was fetched from the provider. */
  fetchedAt?: string;
  /** True when this is a cached copy because the provider could not be reached. */
  stale?: boolean;
}

/** `[west, south, east, north]` in degrees. */
export type BoundingBox = [west: number, south: number, east: number, north: number];

export type CatalogSort = 'relevance' | 'name';

/** The largest page `catalog.search` returns, and its default: "everything" (§12.15). */
export const CATALOG_MAX_LIMIT = 5000;

export interface CatalogQuery {
  /** Free text (not `q`). */
  text?: string;
  providerIds?: ProviderId[];
  kinds?: LocationKind[];
  regions?: string[];
  amenities?: string[];
  bookingModes?: BookingMode[];
  bbox?: BoundingBox;
  /** 1–5000; defaults to 5000. */
  limit?: number;
  offset?: number;
  sort?: CatalogSort;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface CatalogSearchResult {
  items: LocationSummary[];
  /** Every match, ignoring `limit` and `offset`. */
  total: number;
  facets?: {
    regions: FacetCount[];
    amenities: FacetCount[];
    kinds: FacetCount[];
    providers: FacetCount[];
  };
}

/** Why a provider's part of a cross-provider availability call failed. */
export type CatalogErrorCode = 'access-gate' | 'timeout' | 'http' | 'parse' | 'unknown';

export interface CatalogAvailabilityResult {
  entries: BulkAvailabilityEntry[];
  /** One entry per provider that failed; the others still answer. */
  errors: { providerId: ProviderId; code: CatalogErrorCode; message: string }[];
}

export interface CatalogProviderStatus {
  providerId: ProviderId;
  count: number;
  /** ISO timestamp of the last successful sync. */
  syncedAt?: string;
  stale: boolean;
  syncing: boolean;
  lastError?: string;
}

export interface CatalogStatus {
  providers: CatalogProviderStatus[];
}

/** Payload of the `catalog:updated` event. */
export interface CatalogUpdatedEvent {
  providerId: ProviderId;
  count: number;
  /** ISO timestamp. */
  syncedAt: string;
}

// ---------------------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------------------

// z.number() rejects Infinity and NaN.
const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);

/**
 * `[west, south, east, north]`. West must not be east of east: WA never spans the
 * antimeridian, so a box that wraps it is a mistake, not a request.
 */
export const BoundingBoxSchema = z
  .tuple([longitude, latitude, longitude, latitude])
  .refine(([, south, , north]) => south <= north, 'South must not be north of north')
  .refine(([west, , east]) => west <= east, 'West must not be east of east');
assertTypeEquals<z.input<typeof BoundingBoxSchema>, BoundingBox>(true);
assertTypeEquals<z.output<typeof BoundingBoxSchema>, BoundingBox>(true);

export const CatalogQuerySchema = z.object({
  text: z.string().max(200).optional(),
  providerIds: z.array(ProviderIdSchema).optional(),
  kinds: z.array(LocationKindSchema).optional(),
  regions: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  bookingModes: z.array(BookingModeSchema).optional(),
  bbox: BoundingBoxSchema.optional(),
  limit: z.number().int().min(1).max(CATALOG_MAX_LIMIT).default(CATALOG_MAX_LIMIT),
  offset: z.number().int().nonnegative().optional(),
  sort: z.enum(['relevance', 'name']).optional(),
});
/** A `CatalogQuery` after parsing: `limit` has its default. */
export type ParsedCatalogQuery = Simplify<Omit<CatalogQuery, 'limit'> & { limit: number }>;
assertTypeEquals<z.input<typeof CatalogQuerySchema>, CatalogQuery>(true);
assertTypeEquals<z.output<typeof CatalogQuerySchema>, ParsedCatalogQuery>(true);
