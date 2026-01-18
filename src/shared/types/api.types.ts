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

// Generic API Response wrapper
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
