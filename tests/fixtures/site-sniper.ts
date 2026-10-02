/**
 * Site Sniper Test Fixtures
 */

import { SiteSnipe, SiteSnipeInput } from '@shared/types';
import { SnipeReleaseMode, SnipeResult, SnipeStatus } from '@shared/types/common.types';

export const mockSiteSnipeInput: SiteSnipeInput = {
  name: 'Ningaloo Peak Weekend',
  campgroundId: '34',
  campgroundName: 'Osprey Bay',
  targetSiteIds: ['136', '137'],
  siteType: 'all',
  arrivalDate: new Date('2026-07-19T00:00:00Z'),
  departureDate: new Date('2026-07-21T00:00:00Z'),
  numAdult: 2,
  numConcession: 0,
  numChild: 0,
  numInfant: 0,
  numVehicle: 1,
  postcode: '6000',
  releaseMode: SnipeReleaseMode.DAILY_ROLLOVER,
  queueEnabled: false,
  leadTimeSeconds: 120,
  pollIntervalMs: 1500,
  windowDurationMs: 900000,
  maxAttempts: 0,
  notes: 'High demand weekend',
};

export const mockSiteSnipe: SiteSnipe = {
  id: 1,
  userId: 1,
  name: 'Ningaloo Peak Weekend',
  campgroundId: '34',
  campgroundName: 'Osprey Bay',
  targetSiteIds: ['136', '137'],
  siteType: 'all',
  arrivalDate: new Date('2026-07-19T00:00:00Z'),
  departureDate: new Date('2026-07-21T00:00:00Z'),
  numAdult: 2,
  numConcession: 0,
  numChild: 0,
  numInfant: 0,
  numVehicle: 1,
  postcode: '6000',
  releaseMode: SnipeReleaseMode.DAILY_ROLLOVER,
  releaseAt: new Date('2026-01-19T16:00:00Z'),
  queueEnabled: false,
  leadTimeSeconds: 120,
  pollIntervalMs: 1500,
  windowDurationMs: 900000,
  status: SnipeStatus.ARMED,
  isActive: true,
  attemptsCount: 0,
  maxAttempts: 0,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

export const mockScheduledSnipe: SiteSnipe = {
  ...mockSiteSnipe,
  id: 2,
  name: 'Ningaloo Scheduled Release',
  releaseMode: SnipeReleaseMode.SCHEDULED,
  releaseAt: new Date('2026-08-04T02:00:00Z'), // first Tuesday Aug 2026, 10:00 AWST
  queueEnabled: true,
};

export const mockCancellationSnipe: SiteSnipe = {
  ...mockSiteSnipe,
  id: 3,
  name: 'Cancellation Watch',
  releaseMode: SnipeReleaseMode.CANCELLATION,
  releaseAt: undefined,
  targetSiteIds: [],
  status: SnipeStatus.SNIPING,
};

export const mockHeldSnipe: SiteSnipe = {
  ...mockSiteSnipe,
  id: 4,
  status: SnipeStatus.HELD,
  isActive: false,
  attemptsCount: 3,
  lastResult: SnipeResult.HELD,
  heldBookingPk: '987654',
  heldExpiresAt: new Date('2026-01-19T16:30:00Z'),
  paymentUrl: 'https://parkstay.dbca.wa.gov.au/booking/',
};

export const mockInactiveSnipe: SiteSnipe = {
  ...mockSiteSnipe,
  id: 5,
  isActive: false,
  status: SnipeStatus.DISABLED,
};

export function createMockSiteSnipe(overrides: Partial<SiteSnipe> = {}): SiteSnipe {
  return {
    ...mockSiteSnipe,
    ...overrides,
  };
}

export function createMockSiteSnipeInput(overrides: Partial<SiteSnipeInput> = {}): SiteSnipeInput {
  return {
    ...mockSiteSnipeInput,
    ...overrides,
  };
}
