import { WatchResult } from './common.types';

export interface Watch {
  id: number;
  userId: number;
  name: string;
  parkId: string;
  parkName: string;
  campgroundId: string;
  campgroundName: string;
  arrivalDate: Date;
  departureDate: Date;
  numGuests: number;
  preferredSites?: string[];
  siteType?: string;
  checkIntervalMinutes: number;
  isActive: boolean;
  lastCheckedAt?: Date;
  nextCheckAt?: Date;
  lastResult?: WatchResult;
  foundCount: number;
  autoBook: boolean;
  notifyOnly: boolean;
  maxPrice?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchInput {
  name: string;
  parkId: string;
  parkName: string;
  campgroundId: string;
  campgroundName: string;
  arrivalDate: Date;
  departureDate: Date;
  numGuests: number;
  preferredSites?: string[];
  siteType?: string;
  checkIntervalMinutes?: number;
  autoBook?: boolean;
  notifyOnly?: boolean;
  maxPrice?: number;
  notes?: string;
}

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
  dates: {
    arrival: Date;
    departure: Date;
  };
}
