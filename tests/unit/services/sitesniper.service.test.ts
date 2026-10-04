/**
 * SiteSniperService unit tests.
 *
 * The repository, ParkStay, queue and notification dependencies are injected as
 * constructor fakes (no real database), so we exercise the service logic in isolation.
 */

import { SiteSnipe, SiteSnipeInput } from '@shared/types';
import { SnipeReleaseMode, SnipeResult, SnipeStatus } from '@shared/types/common.types';
import { SiteSniperService } from '@main/services/sitesniper/sitesniper.service';
import type { SiteSniperRepository } from '@main/database/repositories';

// Constructor fake for the repository.
const mockRepo = {
  create: jest.fn(),
  update: jest.fn(),
  deleteById: jest.fn(),
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

function makeSnipe(overrides: Partial<SiteSnipe> = {}): SiteSnipe {
  return {
    id: 1,
    userId: 1,
    providerId: 'parkstay',
    locationKey: 'parkstay:34',
    location: { externalId: '34', name: 'Osprey Bay' },
    name: 'Test Snipe',
    stay: {
      arrival: '2026-07-19',
      departure: '2026-07-21',
      adults: 2,
      children: 0,
      infants: 0,
      concessions: 0,
    },
    unitIds: ['136', '137'],
    stayParams: { gearType: 'all', numVehicles: 1, postcode: '6000' },
    releaseMode: SnipeReleaseMode.DAILY_ROLLOVER,
    releaseAt: new Date('2026-01-19T16:00:00Z'),
    accessGateEnabled: false,
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

/** A ParkStay snipe input, as the renderer sends it. */
function snipeInput(overrides: Partial<SiteSnipeInput> = {}): SiteSnipeInput {
  return {
    providerId: 'parkstay',
    name: 'Snipe',
    location: { externalId: '34', name: 'Osprey Bay' },
    stay: { arrival: '2026-07-19', departure: '2026-07-21', adults: 2 },
    releaseMode: SnipeReleaseMode.DAILY_ROLLOVER,
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

    service = new SiteSniperService(
      mockRepo as unknown as SiteSniperRepository,
      parkStay as any,
      queue,
      notifications as any
    );
  });

  describe('execute', () => {
    it('returns ERROR when the snipe is not found', async () => {
      mockRepo.findById.mockReturnValue(null);

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
      expect(result.holdReference).toBe('987654');
      expect(result.matchedSiteId).toBe('136');
    });

    it('picks the first open site when there are no target site ids', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe({ unitIds: [] }));
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
          stay: { ...makeSnipe().stay, arrival: '2026-07-20', departure: '2026-07-22' },
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

    it('passes useQueue through to ParkStay calls when accessGateEnabled', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe({ accessGateEnabled: true }));
      parkStay.getSiteAvailabilityView.mockResolvedValue(
        availabilityView([{ siteId: '136', allOpen: true }])
      );
      parkStay.createBookingHold.mockResolvedValue({ success: true, pk: '1' });

      await service.execute(1);

      expect(parkStay.getSiteAvailabilityView).toHaveBeenCalledWith('34', expect.any(Object), true);
      expect(parkStay.createBookingHold).toHaveBeenCalledWith(expect.any(Object), true);
    });

    it('maps the stay and the ParkStay stay fields onto the availability and hold calls', async () => {
      mockRepo.findById.mockReturnValue(
        makeSnipe({
          stay: {
            arrival: '2026-07-19',
            departure: '2026-07-21',
            adults: 2,
            children: 1,
            infants: 1,
            concessions: 1,
          },
          stayParams: { gearType: 'campervan', numVehicles: 2, postcode: '6530' },
        })
      );
      parkStay.getSiteAvailabilityView.mockResolvedValue(
        availabilityView([{ siteId: '136', allOpen: true }])
      );
      parkStay.createBookingHold.mockResolvedValue({ success: true, pk: '1' });

      await service.execute(1);

      expect(parkStay.getSiteAvailabilityView).toHaveBeenCalledWith(
        '34',
        {
          arrivalDate: '2026-07-19',
          departureDate: '2026-07-21',
          numAdult: 2,
          numConcession: 1,
          numChild: 1,
          numInfant: 1,
          gearType: 'campervan',
        },
        false
      );
      expect(parkStay.createBookingHold).toHaveBeenCalledWith(
        expect.objectContaining({
          campgroundId: '34',
          arrivalDate: '2026-07-19',
          departureDate: '2026-07-21',
          numVehicle: 2,
          postcode: '6530',
        }),
        false
      );
    });

    it('marks a snipe whose stored dates are not calendar dates in error, without polling', async () => {
      mockRepo.findById.mockReturnValue(
        makeSnipe({ stay: { ...makeSnipe().stay, arrival: 'garbage' } })
      );

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(result.error).toMatch(/not calendar dates/);
      expect(parkStay.getSiteAvailabilityView).not.toHaveBeenCalled();
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.ERROR, expect.any(String));
    });
  });

  describe('create', () => {
    it('computes releaseAt for DAILY_ROLLOVER mode', async () => {
      const created = makeSnipe();
      mockRepo.create.mockReturnValue(created);
      mockRepo.findById.mockReturnValue(created);

      await service.create(1, snipeInput({ name: 'Daily' }));

      const passedInput = mockRepo.create.mock.calls[0][1];
      expect(passedInput.releaseAt).toBeInstanceOf(Date);
      // 180 days before 2026-07-19 at 00:00 AWST → 2026-01-19T16:00:00Z
      expect(passedInput.releaseAt.toISOString()).toBe('2026-01-19T16:00:00.000Z');
      // ParkStay's defaults for the stay fields the input left out
      expect(passedInput.stayParams).toEqual({ gearType: 'all', numVehicles: 1 });
    });

    it('keeps the stay fields the input gives over the ParkStay defaults', async () => {
      const created = makeSnipe();
      mockRepo.create.mockReturnValue(created);
      mockRepo.findById.mockReturnValue(created);

      await service.create(
        1,
        snipeInput({ stayParams: { gearType: 'tent', numVehicles: 2, postcode: '6530' } })
      );

      expect(mockRepo.create.mock.calls[0][1].stayParams).toEqual({
        gearType: 'tent',
        numVehicles: 2,
        postcode: '6530',
      });
    });

    it('rejects a provider other than ParkStay, without storing anything', async () => {
      await expect(service.create(1, snipeInput({ providerId: 'fake' }))).rejects.toMatchObject({
        code: 'VALIDATION',
      });
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('primes the next check time for CANCELLATION mode', async () => {
      const created = makeSnipe({ releaseMode: SnipeReleaseMode.CANCELLATION });
      mockRepo.create.mockReturnValue(created);
      mockRepo.findById.mockReturnValue(created);

      await service.create(
        1,
        snipeInput({ name: 'Cancellation', releaseMode: SnipeReleaseMode.CANCELLATION })
      );

      expect(mockRepo.updateCheckTimestamps).toHaveBeenCalledWith(
        created.id,
        expect.any(Date),
        expect.any(Date)
      );
    });

    it('rejects a departure that is not after the arrival, without storing anything', async () => {
      await expect(
        service.create(
          1,
          snipeInput({
            name: 'Backwards',
            stay: { arrival: '2026-07-21', departure: '2026-07-21', adults: 2 },
            releaseMode: SnipeReleaseMode.CANCELLATION,
          })
        )
      ).rejects.toMatchObject({
        code: 'VALIDATION',
        message: 'Departure date must be after arrival date',
      });
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it('requires a release time for a scheduled release', async () => {
      await expect(
        service.create(
          1,
          snipeInput({ name: 'Scheduled', releaseMode: SnipeReleaseMode.SCHEDULED })
        )
      ).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });
});
