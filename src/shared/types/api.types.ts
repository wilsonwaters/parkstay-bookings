// Types for ParkStay API interactions

export interface ParkStaySessionToken {
  token: string;
  expiresAt: Date;
  cookies: Record<string, string>;
}

export interface SearchParams {
  campgroundId: string;
  arrivalDate: string; // ISO date string
  departureDate: string;
  numGuests: number;
  siteType?: string;
}

export interface CampsiteAvailability {
  siteId: string;
  siteName: string;
  siteType: string;
  maxOccupancy: number;
  dates: DateAvailability[];
}

export interface DateAvailability {
  date: string;
  available: boolean;
  price: number;
  bookable: boolean;
}

export interface BookingParams {
  campgroundId: string;
  siteId: string;
  arrivalDate: string;
  departureDate: string;
  siteType?: string;
  numGuests: number;
  customerInfo: CustomerInfo;
}

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface BookingResult {
  success: boolean;
  bookingReference?: string;
  bookingId?: string;
  error?: string;
  details?: any;
}

export interface CampgroundSearchResult {
  id: string;
  name: string;
  parkId?: string;
  parkName?: string;
  region?: string;
  description?: string;
  facilities?: string[];
  imageUrl?: string;
  type?: string; // Campground type from GeoJSON
  coordinates?: [number, number]; // [longitude, latitude] from GeoJSON
}

export interface AvailabilityCheckResult {
  available: boolean;
  sites: CampsiteAvailability[];
  totalAvailable: number;
  totalBookable?: number;
  lowestPrice?: number;
}

export interface RebookParams {
  bookingReference: string;
  newArrivalDate?: string;
  newDepartureDate?: string;
}

export interface RebookResult {
  success: boolean;
  newBookingReference?: string;
  error?: string;
}

// Queue system types (for handling ParkStay queue system)
export interface QueueSessionInfo {
  sitequeueSessionCookie?: string;
  queuePosition?: number;
  estimatedWaitTime?: number;
  queueActive: boolean;
}

/**
 * Why an IPC call failed. Set on every `success: false` response from `ipc/handle.ts`.
 * - VALIDATION: the request payload failed its contract schema (or a service rule); `issues` lists the paths.
 * - FORBIDDEN: the sender is not the app's own top-level renderer frame.
 * - NO_PROFILE: there is no local profile row to act for.
 * - NOT_FOUND: the record the request names does not exist.
 * - INTERNAL: anything else; `error` carries the thrown message.
 *
 * Provider errors (`main/providers/sdk/errors.ts` `toApiError`):
 * - CAPABILITY: the provider does not offer what the request needs (e.g. holds).
 * - UNKNOWN_PROVIDER: no provider is registered with that id.
 * - PROVIDER_ERROR: the provider failed (HTTP error, timeout, unreadable response).
 * - ACCESS_GATE: the provider's waiting room or queue is in the way.
 * - AUTH_REQUIRED: sign in to the provider first.
 * - NOT_IMPLEMENTED: the method is in the contract but its service has not landed yet
 *   (`catalog` and `accounts` until their services are built).
 */
export type ApiErrorCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NO_PROFILE'
  | 'NOT_FOUND'
  | 'INTERNAL'
  | 'CAPABILITY'
  | 'UNKNOWN_PROVIDER'
  | 'PROVIDER_ERROR'
  | 'ACCESS_GATE'
  | 'AUTH_REQUIRED'
  | 'NOT_IMPLEMENTED';

// Generic API Response wrapper
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  /** Set when `success` is false. */
  code?: ApiErrorCode;
  /** For `VALIDATION`: the dotted paths of the payload fields that failed, e.g. `updates.arrivalDate`. */
  issues?: string[];
}
