/**
 * SiteSniperService unit tests.
 *
 * The repository is mocked (no real database) and the ParkStay / Notification
 * services are injected as jest mocks, so we exercise the service logic in
 * isolation. Mirrors queue.test.ts's approach of mocking '@main/database/connection'.
 */

import { SiteSnipe } from '@shared/types';
import { SnipeReleaseMode, SnipeResult, SnipeStatus } from '@shared/types/common.types';

// Avoid the native better-sqlite3 binary via the connection module.
jest.mock('@main/database/connection', () => ({
  getDatabase: () => ({}),
}));

// Mock the repository barrel so `new SiteSniperRepository()` returns our mock.
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findById: jest.fn(),
  findByUserId: jest.fn(),
  findActive: jest.fn(),
  findArmed: jest.fn(),
  findDueForCheck: jest.fn(),
  activate: jest.fn(),
  deactivate: jest.fn(),
  updateStatus: jest.fn(),
  updateCheckTimestamps: jest.fn(),
  incrementAttempts: jest.fn(),
  setHeld: jest.fn(),
  setBooked: jest.fn(),
  setResult: jest.fn(),
  hasReachedMaxAttempts: jest.fn(),
};
jest.mock('@main/database/repositories', () => ({
  SiteSniperRepository: jest.fn().mockImplementation(() => mockRepo),
}));

import { SiteSniperService } from '@main/services/sitesniper/sitesniper.service';

function makeSnipe(overrides: Partial<SiteSnipe> = {}): SiteSnipe {
  return {
    id: 1,
    userId: 1,
    name: 'Test Snipe',
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
    status: SnipeStatus.SNIPING,
    isActive: true,
    attemptsCount: 0,
    maxAttempts: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function availabilityView(sites: Array<{ siteId: string; allOpen: boolean }>) {
  return {
    campgroundId: '34',
    campgroundName: 'Osprey Bay',
    bookingTimeOpen: true,
    sites: sites.map((s) => ({ siteId: s.siteId, days: [], allOpen: s.allOpen })),
  };
}

describe('SiteSniperService', () => {
  let parkStay: { getSiteAvailabilityView: jest.Mock; createBookingHold: jest.Mock };
  let queue: any;
  let notifications: { notifySnipeHeld: jest.Mock; notifySnipeBooked: jest.Mock };
  let service: SiteSniperService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    parkStay = {
      getSiteAvailabilityView: jest.fn(),
      createBookingHold: jest.fn(),
    };
    queue = {};
    notifications = {
      notifySnipeHeld: jest.fn().mockResolvedValue(undefined),
      notifySnipeBooked: jest.fn().mockResolvedValue(undefined),
    };

    mockRepo.hasReachedMaxAttempts.mockReturnValue(false);
    mockRepo.findByUserId.mockReturnValue([]);

    service = new SiteSniperService(parkStay as any, queue, notifications as any);
  });

  describe('execute', () => {
    it('returns ERROR when the snipe is not found', async () => {
      mockRepo.findById.mockReturnValue(undefined);

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(result.success).toBe(false);
      expect(parkStay.getSiteAvailabilityView).not.toHaveBeenCalled();
    });

    it('records TOO_EARLY when no site is open and release is still in the future', async () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockRepo.findById.mockReturnValue(makeSnipe({ releaseAt: future }));
      parkStay.getSiteAvailabilityView.mockResolvedValue(
        availabilityView([{ siteId: '136', allOpen: false }])
      );

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.TOO_EARLY);
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.TOO_EARLY);
      expect(mockRepo.incrementAttempts).toHaveBeenCalledWith(1);
      expect(parkStay.createBookingHold).not.toHaveBeenCalled();
    });

    it('records UNAVAILABLE when no site is open and release has passed', async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockRepo.findById.mockReturnValue(makeSnipe({ releaseAt: past }));
      parkStay.getSiteAvailabilityView.mockResolvedValue(availabilityView([]));

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.UNAVAILABLE);
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.UNAVAILABLE);
    });

    it('places a hold when a target site is open, then notifies and deactivates', async () => {
      const snipe = makeSnipe();
      mockRepo.findById.mockReturnValue(snipe);
      parkStay.getSiteAvailabilityView.mockResolvedValue(
        availabilityView([
          { siteId: '999', allOpen: false },
          { siteId: '136', allOpen: true },
        ])
      );
      parkStay.createBookingHold.mockResolvedValue({ success: true, pk: '987654' });

      const result = await service.execute(1);

      expect(parkStay.createBookingHold).toHaveBeenCalledWith(
        expect.objectContaining({ campgroundId: '34', campsiteId: '136' }),
        false
      );
      expect(mockRepo.setHeld).toHaveBeenCalledWith(
        1,
        '987654',
        expect.any(Date),
        expect.stringContaining('/booking/'),
        '136'
      );
      expect(mockRepo.deactivate).toHaveBeenCalledWith(1);
      expect(notifications.notifySnipeHeld).toHaveBeenCalledTimes(1);
      expect(result.held).toBe(true);
      expect(result.result).toBe(SnipeResult.HELD);
      expect(result.heldBookingPk).toBe('987654');
      expect(result.matchedSiteId).toBe('136');
    });

    it('picks the first open site when there are no target site ids', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe({ targetSiteIds: [] }));
      parkStay.getSiteAvailabilityView.mockResolvedValue(
        availabilityView([{ siteId: '500', allOpen: true }])
      );
      parkStay.createBookingHold.mockResolvedValue({ success: true, pk: '111' });

      const result = await service.execute(1);

      expect(result.matchedSiteId).toBe('500');
      expect(result.held).toBe(true);
    });

    it('records UNAVAILABLE when the hold race is lost', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe());
      parkStay.getSiteAvailabilityView.mockResolvedValue(
        availabilityView([{ siteId: '136', allOpen: true }])
      );
      parkStay.createBookingHold.mockResolvedValue({
        success: false,
        error: "Someone hit 'Book now' before you",
      });

      const result = await service.execute(1);

      expect(result.held).toBe(false);
      expect(result.result).toBe(SnipeResult.UNAVAILABLE);
      expect(mockRepo.setHeld).not.toHaveBeenCalled();
      expect(mockRepo.setResult).toHaveBeenCalledWith(
        1,
        SnipeResult.UNAVAILABLE,
        expect.any(String)
      );
    });

    it('records ERROR when a booking is already in progress', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe());
      parkStay.getSiteAvailabilityView.mockResolvedValue(
        availabilityView([{ siteId: '136', allOpen: true }])
      );
      parkStay.createBookingHold.mockResolvedValue({ success: false, inProgress: true });

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(result.held).toBe(false);
      expect(mockRepo.setHeld).not.toHaveBeenCalled();
    });

    it('skips the hold when an overlapping snipe is already held (one booking per night)', async () => {
      const snipe = makeSnipe();
      mockRepo.findById.mockReturnValue(snipe);
      mockRepo.findByUserId.mockReturnValue([
        makeSnipe({
          id: 2,
          status: SnipeStatus.HELD,
          arrivalDate: new Date('2026-07-20T00:00:00Z'),
          departureDate: new Date('2026-07-22T00:00:00Z'),
        }),
      ]);
      parkStay.getSiteAvailabilityView.mockResolvedValue(
        availabilityView([{ siteId: '136', allOpen: true }])
      );

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(parkStay.createBookingHold).not.toHaveBeenCalled();
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.ERROR, expect.any(String));
    });

    it('deactivates and returns EXPIRED when max attempts reached', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe({ maxAttempts: 3, attemptsCount: 3 }));
      mockRepo.hasReachedMaxAttempts.mockReturnValue(true);

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.EXPIRED);
      expect(mockRepo.deactivate).toHaveBeenCalledWith(1);
      expect(parkStay.getSiteAvailabilityView).not.toHaveBeenCalled();
    });

    it('returns ERROR (never throws) when the availability call throws', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe());
      parkStay.getSiteAvailabilityView.mockRejectedValue(new Error('network down'));

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(result.error).toBe('network down');
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.ERROR, 'network down');
    });

    it('returns EXPIRED when the snipe is inactive', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe({ isActive: false }));

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.EXPIRED);
      expect(parkStay.getSiteAvailabilityView).not.toHaveBeenCalled();
    });

    it('passes useQueue through to ParkStay calls when queueEnabled', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe({ queueEnabled: true }));
      parkStay.getSiteAvailabilityView.mockResolvedValue(
        availabilityView([{ siteId: '136', allOpen: true }])
      );
      parkStay.createBookingHold.mockResolvedValue({ success: true, pk: '1' });

      await service.execute(1);

      expect(parkStay.getSiteAvailabilityView).toHaveBeenCalledWith('34', expect.any(Object), true);
      expect(parkStay.createBookingHold).toHaveBeenCalledWith(expect.any(Object), true);
    });
  });

  describe('create', () => {
    it('computes releaseAt for DAILY_ROLLOVER mode', async () => {
      const created = makeSnipe();
      mockRepo.create.mockReturnValue(created);
      mockRepo.findById.mockReturnValue(created);

      await service.create(1, {
        name: 'Daily',
        campgroundId: '34',
        arrivalDate: new Date('2026-07-19T00:00:00Z'),
        departureDate: new Date('2026-07-21T00:00:00Z'),
        releaseMode: SnipeReleaseMode.DAILY_ROLLOVER,
      });

      const passedInput = mockRepo.create.mock.calls[0][1];
      expect(passedInput.releaseAt).toBeInstanceOf(Date);
      // 180 days before 2026-07-19 at 00:00 AWST → 2026-01-19T16:00:00Z
      expect(passedInput.releaseAt.toISOString()).toBe('2026-01-19T16:00:00.000Z');
    });

    it('primes the next check time for CANCELLATION mode', async () => {
      const created = makeSnipe({ releaseMode: SnipeReleaseMode.CANCELLATION });
      mockRepo.create.mockReturnValue(created);
      mockRepo.findById.mockReturnValue(created);

      await service.create(1, {
        name: 'Cancellation',
        campgroundId: '34',
        arrivalDate: new Date('2026-07-19T00:00:00Z'),
        departureDate: new Date('2026-07-21T00:00:00Z'),
        releaseMode: SnipeReleaseMode.CANCELLATION,
      });

      expect(mockRepo.updateCheckTimestamps).toHaveBeenCalledWith(
        created.id,
        expect.any(Date),
        expect.any(Date)
      );
    });
  });
});
