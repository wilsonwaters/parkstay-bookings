import { WatchResult } from './common.types';
import type { ProviderId, StayParams } from './provider.types';
import type { LocationRef, Stay, StayInput } from './stay.types';

/**
 * A recurring availability check for a stay at one location of one provider.
 * Instants (`lastCheckedAt`, `nextCheckAt`, timestamps) are `Date`s; stay dates are
 * calendar dates `YYYY-MM-DD`.
 */
export interface Watch {
  id: number;
  userId: number;
  providerId: ProviderId;
  /** `${providerId}:${location.externalId}` */
  locationKey: string;
  location: LocationRef;
  name: string;
  stay: Stay;
  /** Preferred units (ParkStay: site ids or names). Empty means any unit. */
  unitIds: string[];
  /** The provider's own stay fields (ParkStay: `parkId`, `gearType`). */
  stayParams: StayParams;
  checkIntervalMinutes: number;
  isActive: boolean;
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
  lastResult?: WatchResult;
  lastAvailability?: AvailabilityResult[];
  foundCount: number;
  autoBook: boolean;
  notifyOnly: boolean;
  allowPartialMatch: boolean;
  maxPrice?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A watch as create requests send it. Main resolves the user. */
export interface WatchInput {
  providerId: ProviderId;
  name: string;
  location: LocationRef;
  stay: StayInput;
  unitIds?: string[];
  stayParams?: StayParams;
  checkIntervalMinutes?: number;
  autoBook?: boolean;
  notifyOnly?: boolean;
  allowPartialMatch?: boolean;
  maxPrice?: number;
  notes?: string;
}

/** The fields an update may change. A watch never moves to another provider. */
export type WatchUpdate = Partial<Omit<WatchInput, 'providerId'>>;

// Result from executing a watch
export interface WatchExecutionResult {
  watchId: number;
  success: boolean;
  found: boolean;
  availability?: AvailabilityResult[];
  error?: Error;
  checkedAt: Date;
}

export interface AvailabilityResult {
  siteId: string;
  siteName: string;
  siteType: string;
  available: boolean;
  price: number;
  /** The stay this result covers, as calendar dates `YYYY-MM-DD`. */
  dates: {
    arrival: string;
    departure: string;
  };
  partial?: boolean;
}
