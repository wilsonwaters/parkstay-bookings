/**
 * Watch Test Fixtures
 */

import { Watch, WatchInput } from '@shared/types';
import { WatchResult } from '@shared/types/common.types';

export const mockWatchInput: WatchInput = {
  name: 'Karijini Watch',
  parkId: 'PARK001',
  parkName: 'Karijini National Park',
  campgroundId: 'CG001',
  campgroundName: 'Dales Campground',
  arrivalDate: new Date('2024-07-01'),
  departureDate: new Date('2024-07-05'),
  numGuests: 2,
  preferredSites: ['Site 1', 'Site 2', 'Site 3'],
  siteType: 'Unpowered',
  checkIntervalMinutes: 5,
  autoBook: false,
  notifyOnly: true,
  maxPrice: 50.0,
  notes: 'Looking for unpowered sites',
};

export const mockWatch: Watch = {
  id: 1,
  userId: 1,
  name: 'Karijini Watch',
  parkId: 'PARK001',
  parkName: 'Karijini National Park',
  campgroundId: 'CG001',
  campgroundName: 'Dales Campground',
  arrivalDate: new Date('2024-07-01'),
  departureDate: new Date('2024-07-05'),
  numGuests: 2,
  preferredSites: ['Site 1', 'Site 2', 'Site 3'],
  siteType: 'Unpowered',
  checkIntervalMinutes: 5,
  isActive: true,
  lastCheckedAt: null,
  nextCheckAt: null,
  lastResult: null,
  foundCount: 0,
  autoBook: false,
  notifyOnly: true,
  maxPrice: 50.0,
  notes: 'Looking for unpowered sites',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const mockActiveWatch: Watch = {
  ...mockWatch,
  id: 2,
  isActive: true,
  lastCheckedAt: new Date('2024-01-01T10:00:00Z'),
  nextCheckAt: new Date('2024-01-01T10:05:00Z'),
  lastResult: WatchResult.NOT_FOUND,
};

export const mockInactiveWatch: Watch = {
  ...mockWatch,
  id: 3,
  isActive: false,
  lastResult: WatchResult.FOUND,
  foundCount: 1,
};

export const mockWatchWithAutoBook: Watch = {
  ...mockWatch,
  id: 4,
  autoBook: true,
  notifyOnly: false,
};

export const mockDueWatch: Watch = {
  ...mockWatch,
  id: 5,
  isActive: true,
  lastCheckedAt: new Date('2024-01-01T09:55:00Z'),
  nextCheckAt: new Date('2024-01-01T10:00:00Z'),
};

export const invalidWatchInputs = [
  {
    ...mockWatchInput,
    arrivalDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
    expectedError: 'Arrival date must be in the future',
  },
  {
    ...mockWatchInput,
    arrivalDate: new Date('2024-07-05'),
    departureDate: new Date('2024-07-01'),
    expectedError: 'Departure date must be after arrival date',
  },
];

export function createMockWatch(overrides: Partial<Watch> = {}): Watch {
  return {
    ...mockWatch,
    ...overrides,
  };
}

export function createMockWatchInput(overrides: Partial<WatchInput> = {}): WatchInput {
  const futureDate1 = new Date();
  futureDate1.setDate(futureDate1.getDate() + 30);
  const futureDate2 = new Date();
  futureDate2.setDate(futureDate2.getDate() + 34);

  return {
    ...mockWatchInput,
    arrivalDate: overrides.arrivalDate || futureDate1,
    departureDate: overrides.departureDate || futureDate2,
    ...overrides,
  };
}

export function createMultipleMockWatches(count: number, userId: number = 1): Watch[] {
  return Array.from({ length: count }, (_, i) => {
    const arrivalDate = new Date();
    arrivalDate.setDate(arrivalDate.getDate() + (i + 1) * 7);
    const departureDate = new Date(arrivalDate);
    departureDate.setDate(departureDate.getDate() + 3);

    return createMockWatch({
      id: i + 1,
      userId,
      name: `Watch ${i + 1}`,
      campgroundId: `CG${String(i + 1).padStart(3, '0')}`,
      arrivalDate,
      departureDate,
    });
  });
}
