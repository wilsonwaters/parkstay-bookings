/**
 * Skip The Queue Test Fixtures
 */

import { SkipTheQueueEntry, STQInput } from '@shared/types';
import { STQResult } from '@shared/types/common.types';

export const mockSTQInput: STQInput = {
  bookingId: 1,
  bookingReference: 'BK123456',
  checkIntervalMinutes: 2,
  maxAttempts: 1000,
  notes: 'Attempting to extend booking',
};

export const mockSTQEntry: SkipTheQueueEntry = {
  id: 1,
  userId: 1,
  bookingId: 1,
  bookingReference: 'BK123456',
  isActive: true,
  checkIntervalMinutes: 2,
  lastCheckedAt: null,
  nextCheckAt: null,
  attemptsCount: 0,
  maxAttempts: 1000,
  lastResult: null,
  successDate: null,
  newBookingReference: null,
  notes: 'Attempting to extend booking',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

export const mockActiveSTQEntry: SkipTheQueueEntry = {
  ...mockSTQEntry,
  id: 2,
  isActive: true,
  lastCheckedAt: new Date('2024-01-01T10:00:00Z'),
  nextCheckAt: new Date('2024-01-01T10:02:00Z'),
  attemptsCount: 5,
  lastResult: STQResult.UNAVAILABLE,
};

export const mockInactiveSTQEntry: SkipTheQueueEntry = {
  ...mockSTQEntry,
  id: 3,
  isActive: false,
  lastResult: STQResult.UNAVAILABLE,
  attemptsCount: 50,
};

export const mockSuccessfulSTQEntry: SkipTheQueueEntry = {
  ...mockSTQEntry,
  id: 4,
  isActive: false,
  lastResult: STQResult.REBOOKED,
  successDate: new Date('2024-01-01T12:00:00Z'),
  newBookingReference: 'BK789012',
  attemptsCount: 42,
};

export const mockMaxAttemptsSTQEntry: SkipTheQueueEntry = {
  ...mockSTQEntry,
  id: 5,
  isActive: false,
  attemptsCount: 1000,
  maxAttempts: 1000,
  lastResult: STQResult.ERROR,
};

export const mockDueSTQEntry: SkipTheQueueEntry = {
  ...mockSTQEntry,
  id: 6,
  isActive: true,
  lastCheckedAt: new Date('2024-01-01T09:58:00Z'),
  nextCheckAt: new Date('2024-01-01T10:00:00Z'),
  attemptsCount: 10,
};

export function createMockSTQEntry(overrides: Partial<SkipTheQueueEntry> = {}): SkipTheQueueEntry {
  return {
    ...mockSTQEntry,
    ...overrides,
  };
}

export function createMockSTQInput(overrides: Partial<STQInput> = {}): STQInput {
  return {
    ...mockSTQInput,
    ...overrides,
  };
}

export function createMultipleMockSTQEntries(
  count: number,
  userId: number = 1
): SkipTheQueueEntry[] {
  return Array.from({ length: count }, (_, i) =>
    createMockSTQEntry({
      id: i + 1,
      userId,
      bookingId: i + 1,
      bookingReference: `BK${100000 + i}`,
      attemptsCount: i * 10,
    })
  );
}
