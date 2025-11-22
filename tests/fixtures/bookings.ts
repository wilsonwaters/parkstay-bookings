/**
 * Booking Test Fixtures
 */

import { Booking, BookingInput, BookingStatus } from '@shared/types';
import { randomBookingReference } from '@tests/utils/test-helpers';

export const mockBookingInput: BookingInput = {
  bookingReference: 'BK123456',
  parkName: 'Karijini National Park',
  campgroundName: 'Dales Campground',
  siteNumber: '12',
  siteType: 'Unpowered',
  arrivalDate: new Date('2024-06-15'),
  departureDate: new Date('2024-06-18'),
  numNights: 3,
  numGuests: 2,
  totalCost: 105.0,
  currency: 'AUD',
  status: BookingStatus.CONFIRMED,
  notes: 'Test booking',
};

export const mockBooking: Booking = {
  id: 1,
  userId: 1,
  bookingReference: 'BK123456',
  parkName: 'Karijini National Park',
  campgroundName: 'Dales Campground',
  siteNumber: '12',
  siteType: 'Unpowered',
  arrivalDate: new Date('2024-06-15'),
  departureDate: new Date('2024-06-18'),
  numNights: 3,
  numGuests: 2,
  totalCost: 105.0,
  currency: 'AUD',
  status: BookingStatus.CONFIRMED,
  notes: 'Test booking',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  syncedAt: null,
};

export const mockUpcomingBooking: Booking = {
  ...mockBooking,
  id: 2,
  bookingReference: 'BK234567',
  arrivalDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  departureDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
};

export const mockPastBooking: Booking = {
  ...mockBooking,
  id: 3,
  bookingReference: 'BK345678',
  arrivalDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
  departureDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
};

export const mockCancelledBooking: Booking = {
  ...mockBooking,
  id: 4,
  bookingReference: 'BK456789',
  status: BookingStatus.CANCELLED,
};

export const invalidBookingInputs = [
  {
    ...mockBookingInput,
    bookingReference: '',
    expectedError: 'Booking reference is required',
  },
  {
    ...mockBookingInput,
    parkName: '',
    expectedError: 'Park name is required',
  },
  {
    ...mockBookingInput,
    campgroundName: '',
    expectedError: 'Campground name is required',
  },
  {
    ...mockBookingInput,
    arrivalDate: new Date('2024-06-18'),
    departureDate: new Date('2024-06-15'),
    expectedError: 'Departure date must be after arrival date',
  },
  {
    ...mockBookingInput,
    numGuests: 0,
    expectedError: 'Number of guests must be at least 1',
  },
  {
    ...mockBookingInput,
    numGuests: 100,
    expectedError: 'Number of guests cannot exceed 50',
  },
  {
    ...mockBookingInput,
    totalCost: -10,
    expectedError: 'Total cost cannot be negative',
  },
];

export function createMockBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    ...mockBooking,
    ...overrides,
  };
}

export function createMockBookingInput(overrides: Partial<BookingInput> = {}): BookingInput {
  return {
    ...mockBookingInput,
    bookingReference: overrides.bookingReference || randomBookingReference(),
    ...overrides,
  };
}

export function createMultipleMockBookings(count: number, userId: number = 1): Booking[] {
  return Array.from({ length: count }, (_, i) =>
    createMockBooking({
      id: i + 1,
      userId,
      bookingReference: `BK${100000 + i}`,
      arrivalDate: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000),
      departureDate: new Date(Date.now() + (i + 4) * 7 * 24 * 60 * 60 * 1000),
    })
  );
}
