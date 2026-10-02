/**
 * `AccommodationProvider`: what a provider module implements (architecture-notes §3, §12).
 * Main-process only; the serialisable types it returns live in `shared/types`.
 *
 * A provider is a manifest plus optional modules. Core services resolve a provider through
 * the registry and check `manifest.capabilities` (or `registry.require`) before using a
 * module; the registry rejects a manifest that claims a capability without its module.
 *
 * Adding a provider: create `src/main/providers/<id>/`, export a `ProviderFactory` made with
 * `defineProvider`, and add it to `BUILT_IN_PROVIDERS` in `providers/index.ts`.
 */

import type {
  AccessStatus,
  AccountStatus,
  BulkAvailabilityEntry,
  LocationAvailability,
  ProviderId,
  ProviderManifest,
  StayParams,
  StayQuery,
} from '@shared/types/provider.types';
import type { LocationDetail, LocationSummary } from '@shared/types/catalog.types';
import type { SnipeReleaseMode } from '@shared/types/common.types';
import type { ProviderContext } from './context';
import type { HttpClient } from './http';

export interface CatalogModule {
  listLocations(signal?: AbortSignal): Promise<LocationSummary[]>;
  getLocation(externalId: string, signal?: AbortSignal): Promise<LocationDetail>;
}

export interface AvailabilityCheckOptions {
  /** Only these units. */
  unitIds?: string[];
  signal?: AbortSignal;
}

export interface AvailabilityModule {
  check(
    externalId: string,
    stay: StayQuery,
    options?: AvailabilityCheckOptions
  ): Promise<LocationAvailability>;
  /** Availability for every location in one call (`capabilities.bulkAvailability`). */
  search?(stay: StayQuery, signal?: AbortSignal): Promise<BulkAvailabilityEntry[]>;
}

export interface AccessGateEnsureOptions {
  signal?: AbortSignal;
  /** Give up with `AccessGateError` after this long. */
  maxWaitMs?: number;
}

/** A waiting room or virtual queue in front of the provider (ParkStay: the DBCA queue). */
export interface AccessGate {
  status(): AccessStatus;
  /** Joins or refreshes the queue and resolves once access is `active`. */
  ensure(options?: AccessGateEnsureOptions): Promise<AccessStatus>;
  /** Keeps the session alive until the returned release is called. Ref-counted. */
  holdOpen(): () => void;
  /** Subscribes to status changes; returns the unsubscribe function. */
  onStatus(listener: (status: AccessStatus) => void): () => void;
  /** Stops every timer and drops every listener. */
  dispose(): void;
}

/**
 * A release mode id (`ReleaseModeDescriptor.id`). ParkStay's are the generic
 * `SnipeReleaseMode` values; another provider may describe its own modes (§12.3).
 */
export type ReleaseModeId = `${SnipeReleaseMode}` | (string & Record<never, never>);

export interface ReleaseComputeInput {
  mode: ReleaseModeId;
  externalId: string;
  stay: StayQuery;
  /** Values for the mode's own `fields` (§12.3). */
  params?: StayParams;
  /** The release time a person entered, for modes such as `scheduled`. */
  requestedAt?: Date;
  now: Date;
  signal?: AbortSignal;
}

/** When units for a date become bookable (ParkStay: 180-day rollover, scheduled releases). */
export interface ReleasePolicy {
  supports(mode: ReleaseModeId): boolean;
  /** The instant the stay opens, or `null` when it never "opens" (poll continuously). */
  computeReleaseAt(input: ReleaseComputeInput): Promise<Date | null>;
  /** A sentence such as "Bookings open 180 days ahead at 12:00 am AWST". */
  describe(externalId: string, signal?: AbortSignal): Promise<string | undefined>;
  /** A sensible default for a `scheduled` release, if the provider has one. */
  suggestScheduledAt?(externalId: string, now: Date): Date | null;
  /** The fastest the core may poll: inside a release window, and continuously. */
  readonly pollFloorMs: { window: number; continuous: number };
}

export interface HoldRequest {
  externalId: string;
  unitId?: string;
  /** For providers that hold a class of unit rather than a specific one. */
  unitGroupId?: string;
  stay: StayQuery;
}

export type HoldFailureReason =
  | 'taken'
  | 'in-progress'
  | 'auth-required'
  | 'closed'
  | 'invalid'
  | 'error';

export interface HoldSuccess {
  ok: true;
  reference: string;
  expiresAt: Date;
  unitId?: string;
}

export interface HoldFailure {
  ok: false;
  reason: HoldFailureReason;
  message: string;
}

export type HoldResult = HoldSuccess | HoldFailure;

export interface HoldsModule {
  /** Places a temporary hold. A refusal is a `HoldFailure`, not a rejection. */
  create(request: HoldRequest, signal?: AbortSignal): Promise<HoldResult>;
  /** Where the person completes payment for a hold. */
  paymentUrl(hold: HoldSuccess): string;
  /** Top-level origins the payment window may visit. */
  readonly paymentOrigins?: readonly string[];
}

export interface ExternalBooking {
  reference: string;
  externalId: string;
  locationName: string;
  unitName?: string;
  /** Calendar dates `YYYY-MM-DD`. */
  arrival: string;
  departure: string;
  guests?: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'unknown';
  totalPrice?: number;
}

export interface BookingsModule {
  list?(signal?: AbortSignal): Promise<ExternalBooking[]>;
  get?(reference: string, signal?: AbortSignal): Promise<ExternalBooking>;
}

/** Sign-in on the provider's own pages, in an app window on the provider's partition (D5). */
export interface ProviderAuth {
  kind: 'browser-session';
  signInUrl: string;
  /** Top-level https origins the sign-in window may visit. */
  allowedOrigins: readonly string[];
  /** URL patterns (`*` wildcard) that mean sign-in finished. */
  completionUrlPatterns?: readonly string[];
  /** Asks the provider, with the partition's cookies, whether the session is signed in. */
  isSignedIn(http: HttpClient, signal?: AbortSignal): Promise<AccountStatus>;
}

export interface ProviderLinks {
  /** The location's page on the provider's site. */
  location(externalId: string): string | null;
  /** A booking deep link, for the stay when given. */
  booking(externalId: string, stay?: StayQuery): string | null;
  /** Where the person manages an existing booking (§12.5). */
  manageBooking?(reference: string): string | null;
}

export interface AccommodationProvider {
  readonly manifest: ProviderManifest;
  catalog?: CatalogModule;
  availability?: AvailabilityModule;
  access?: AccessGate;
  release?: ReleasePolicy;
  holds?: HoldsModule;
  bookings?: BookingsModule;
  auth?: ProviderAuth;
  links: ProviderLinks;
  dispose?(): Promise<void>;
}

/** Builds a provider for its context. Carries the provider id so the context can be made first. */
export interface ProviderFactory {
  (ctx: ProviderContext): AccommodationProvider;
  readonly id: ProviderId;
}

export function defineProvider(
  id: ProviderId,
  create: (ctx: ProviderContext) => AccommodationProvider
): ProviderFactory {
  return Object.assign((ctx: ProviderContext) => create(ctx), { id });
}
