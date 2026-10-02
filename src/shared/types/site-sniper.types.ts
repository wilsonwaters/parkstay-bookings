import { SnipeResult, SnipeReleaseMode, SnipeStatus } from './common.types';

/**
 * A Site Snipe: an automated attempt to book a high-demand campsite at the
 * earliest legal moment it becomes available (daily rollover, scheduled
 * release, or continuous cancellation watch). Stops at placing the 30-minute
 * temporary hold; payment stays a human step.
 */
export interface SiteSnipe {
  id: number;
  userId: number;
  name: string;
  campgroundId: string;
  campgroundName?: string;
  // Preferred site ids (strings). Empty => any site in the campground.
  targetSiteIds: string[];
  siteType: string; // gear_type: 'tent'|'campervan'|'caravan'|'all'
  arrivalDate: Date;
  departureDate: Date;
  numAdult: number;
  numConcession: number;
  numChild: number;
  numInfant: number;
  numVehicle: number;
  postcode?: string;
  releaseMode: SnipeReleaseMode;
  // exact release instant (UTC). Required for SCHEDULED; computed for
  // DAILY_ROLLOVER; null for CANCELLATION
  releaseAt?: Date;
  queueEnabled: boolean; // pre-establish DBCA queue session (Ningaloo)
  leadTimeSeconds: number; // start warm-up/queue this many seconds before releaseAt
  pollIntervalMs: number; // tight-poll cadence during the snipe window
  windowDurationMs: number; // how long to keep sniping after release before giving up
  status: SnipeStatus;
  isActive: boolean;
  attemptsCount: number;
  maxAttempts: number; // 0 = unlimited within window
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
  lastResult?: SnipeResult;
  lastError?: string;
  heldBookingPk?: string; // pk from create_booking
  heldExpiresAt?: Date; // hold + 30 min
  paymentUrl?: string;
  bookedReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input shape used to create/update a Site Snipe.
 */
export interface SiteSnipeInput {
  name: string;
  campgroundId: string;
  campgroundName?: string;
  targetSiteIds?: string[];
  siteType?: string;
  arrivalDate: Date;
  departureDate: Date;
  numAdult?: number;
  numConcession?: number;
  numChild?: number;
  numInfant?: number;
  numVehicle?: number;
  postcode?: string;
  releaseMode: SnipeReleaseMode;
  releaseAt?: Date;
  queueEnabled?: boolean;
  leadTimeSeconds?: number;
  pollIntervalMs?: number;
  windowDurationMs?: number;
  maxAttempts?: number;
  notes?: string;
}

/**
 * Result of a single snipe execution attempt.
 */
export interface SnipeExecutionResult {
  snipeId: number;
  success: boolean; // the attempt ran without a thrown error
  result: SnipeResult; // outcome classification
  held: boolean;
  heldBookingPk?: string;
  paymentUrl?: string;
  matchedSiteId?: string;
  error?: string;
  checkedAt: Date;
}

// Parsed shape returned by ParkStayService.getSiteAvailabilityView
export interface SiteDayStatus {
  date: string; // YYYY-MM-DD
  status: string; // 'open' | 'booked' | 'closed' | 'toofar' | 'tooearly' | 'pastdate' | ...
}

export interface SiteAvailabilityEntry {
  siteId: string;
  siteName?: string;
  siteClassId?: string;
  days: SiteDayStatus[];
  allOpen: boolean; // true iff every night in the requested range === 'open'
}

export interface SiteAvailabilityView {
  campgroundId: string;
  campgroundName?: string;
  releaseDate?: string;
  bookingOpenDate?: string;
  bookingTimeOpen: boolean;
  sites: SiteAvailabilityEntry[];
}
