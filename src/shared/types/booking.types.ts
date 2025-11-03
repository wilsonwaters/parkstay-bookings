import { BookingStatus } from './common.types';

export interface Booking {
  id: number;
  userId: number;
  bookingReference: string;
  parkName: string;
  campgroundName: string;
  siteNumber?: string;
  siteType?: string;
  arrivalDate: Date;
  departureDate: Date;
  numNights: number;
  numGuests: number;
  totalCost?: number;
  currency: string;
  status: BookingStatus;
  bookingData?: ParkStayBookingData;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  syncedAt?: Date;
}

export interface BookingInput {
  bookingReference: string;
  parkName: string;
  campgroundName: string;
  siteNumber?: string;
  siteType?: string;
  arrivalDate: Date;
  departureDate: Date;
  numGuests: number;
  totalCost?: number;
  notes?: string;
}

// Raw booking data from ParkStay API
export interface ParkStayBookingData {
  id: string;
  bookingNumber: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  campground: {
    id: string;
    name: string;
    parkId: string;
    parkName: string;
  };
  site: {
    id: string;
    name: string;
    type: string;
  };
  dates: {
    arrival: string;
    departure: string;
    nights: number;
  };
  charges: {
    subtotal: number;
    fees: number;
    total: number;
    currency: string;
  };
  status: string;
  createdAt: string;
  // Additional fields from ParkStay
  [key: string]: any;
}
