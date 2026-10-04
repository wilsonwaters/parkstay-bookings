/**
 * SiteSniperService unit tests.
 *
 * The repository, the provider (availability, holds, release policy, access gate) and the
 * notification service are constructor fakes (no database, no network), so the service's
 * own logic is exercised. `tests/integration/sitesniper-parkstay.test.ts` runs it against the
 * real ParkStay module and a fixture server.
 */

import { SiteSnipe, SiteSnipeInput } from '@shared/types';
import type { LocationAvailability, StayQuery } from '@shared/types/provider.types';
import { SnipeReleaseMode, SnipeResult, SnipeStatus } from '@shared/types/common.types';
import {
  SiteSniperService,
  type SnipeProvider,
} from '@main/services/sitesniper/sitesniper.service';
import { parkstayManifest } from '@main/providers/parkstay';
import { ProviderHttpError, type HoldResult } from '@main/providers/sdk';
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

/** The provider's answer for a stay: each unit free for both nights, or booked. */
function availability(
  units: Array<{ unitId: string; free: boolean }>,
  release: LocationAvailability['release'] = { open: true }
): LocationAvailability {
  return {
    key: 'parkstay:34',
    checkedAt: new Date().toISOString(),
    release,
    units: units.map(({ unitId, free }) => ({
      unitId,
      unitName: `Site ${unitId}`,
      fullyAvailable: free,
      nights: ['2026-07-19', '2026-07-20'].map((date) => ({
        date,
        state: free ? ('available' as const) : ('booked' as const),
        price: 30,
      })),
      ...(free ? { total: 60 } : {}),
    })),
  };
}

const held = (reference = '987654'): HoldResult => ({
  ok: true,
  reference,
  expiresAt: new Date(Date.now() + 30 * 60_000),
});

describe('SiteSniperService', () => {
  let provider: {
    manifest: typeof parkstayManifest;
    availability: { check: jest.Mock };
    holds: { create: jest.Mock; paymentUrl: jest.Mock };
    release: { computeReleaseAt: jest.Mock };
    access: { ensure: jest.Mock };
  };
  let notifications: { notifySnipeHeld: jest.Mock; notifySnipeBooked: jest.Mock };
  let service: SiteSniperService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    provider = {
      manifest: parkstayManifest,
      availability: { check: jest.fn() },
      holds: {
        create: jest.fn(),
        paymentUrl: jest.fn(() => 'https://parkstay.dbca.wa.gov.au/booking/'),
      },
      release: {
        computeReleaseAt: jest.fn(async () => new Date('2026-01-19T18:00:00.000Z')),
      },
      access: { ensure: jest.fn() },
    };
    notifications = {
      notifySnipeHeld: jest.fn().mockResolvedValue(undefined),
      notifySnipeBooked: jest.fn().mockResolvedValue(undefined),
    };

    mockRepo.hasReachedMaxAttempts.mockReturnValue(false);
    mockRepo.findByUserId.mockReturnValue([]);

    service = new SiteSniperService(
      mockRepo as unknown as SiteSniperRepository,
      provider as unknown as SnipeProvider,
      notifications as any
    );
  });

  describe('execute', () => {
    it('returns ERROR when the snipe is not found', async () => {
      mockRepo.findById.mockReturnValue(null);

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(result.success).toBe(false);
      expect(provider.availability.check).not.toHaveBeenCalled();
    });

    it('records TOO_EARLY when no site is open and release is still in the future', async () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
      mockRepo.findById.mockReturnValue(makeSnipe({ releaseAt: future }));
      provider.availability.check.mockResolvedValue(availability([{ unitId: '136', free: false }]));

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.TOO_EARLY);
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.TOO_EARLY);
      expect(mockRepo.incrementAttempts).toHaveBeenCalledWith(1);
      expect(provider.holds.create).not.toHaveBeenCalled();
    });

    it('records TOO_EARLY when the provider says the dates are not released yet', async () => {
      mockRepo.findById.mockReturnValue(
        makeSnipe({ releaseMode: SnipeReleaseMode.CANCELLATION, releaseAt: undefined })
      );
      provider.availability.check.mockResolvedValue(
        availability([{ unitId: '136', free: false }], { open: false })
      );

      expect((await service.execute(1)).result).toBe(SnipeResult.TOO_EARLY);
    });

    it('records UNAVAILABLE when no site is open and release has passed', async () => {
      const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockRepo.findById.mockReturnValue(makeSnipe({ releaseAt: past }));
      provider.availability.check.mockResolvedValue(availability([]));

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.UNAVAILABLE);
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.UNAVAILABLE);
    });

    it('places a hold when a target site is open, then notifies and deactivates', async () => {
      const snipe = makeSnipe();
      mockRepo.findById.mockReturnValue(snipe);
      provider.availability.check.mockResolvedValue(
        availability([
          { unitId: '137', free: false },
          { unitId: '136', free: true },
        ])
      );
      provider.holds.create.mockResolvedValue(held());

      const result = await service.execute(1);

      // Only the preferred units are asked about.
      expect(provider.availability.check).toHaveBeenCalledWith('34', expect.any(Object), {
        unitIds: ['136', '137'],
      });
      expect(provider.holds.create).toHaveBeenCalledWith(
        expect.objectContaining({ externalId: '34', unitId: '136' })
      );
      expect(mockRepo.setHeld).toHaveBeenCalledWith(
        1,
        '987654',
        expect.any(Date),
        'https://parkstay.dbca.wa.gov.au/booking/',
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
      provider.availability.check.mockResolvedValue(
        availability([
          { unitId: '499', free: false },
          { unitId: '500', free: true },
        ])
      );
      provider.holds.create.mockResolvedValue(held('111'));

      const result = await service.execute(1);

      expect(provider.availability.check).toHaveBeenCalledWith('34', expect.any(Object), {
        unitIds: undefined,
      });

      expect(result.matchedSiteId).toBe('500');
      expect(result.held).toBe(true);
    });

    it('records UNAVAILABLE when the hold race is lost', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe());
      provider.availability.check.mockResolvedValue(availability([{ unitId: '136', free: true }]));
      provider.holds.create.mockResolvedValue({
        ok: false,
        reason: 'taken',
        message: "Someone hit 'Book now' before you",
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
      provider.availability.check.mockResolvedValue(availability([{ unitId: '136', free: true }]));
      provider.holds.create.mockResolvedValue({
        ok: false,
        reason: 'in-progress',
        message: 'You have an in-progress booking.',
      });

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
      provider.availability.check.mockResolvedValue(availability([{ unitId: '136', free: true }]));

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(provider.holds.create).not.toHaveBeenCalled();
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.ERROR, expect.any(String));
    });

    it('deactivates and returns EXPIRED when max attempts reached', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe({ maxAttempts: 3, attemptsCount: 3 }));
      mockRepo.hasReachedMaxAttempts.mockReturnValue(true);

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.EXPIRED);
      expect(mockRepo.deactivate).toHaveBeenCalledWith(1);
      expect(provider.availability.check).not.toHaveBeenCalled();
    });

    it('returns ERROR (never throws) when the availability call throws', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe());
      provider.availability.check.mockRejectedValue(new Error('network down'));

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(result.error).toBe('network down');
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.ERROR, 'network down');
    });

    it('returns EXPIRED when the snipe is inactive', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe({ isActive: false }));

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.EXPIRED);
      expect(provider.availability.check).not.toHaveBeenCalled();
    });

    it('records an HTTP 500 as an error, never as "unavailable"', async () => {
      mockRepo.findById.mockReturnValue(makeSnipe());
      provider.availability.check.mockRejectedValue(
        new ProviderHttpError({ providerId: 'parkstay', status: 500, url: 'https://x/api/' })
      );

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(result.error).toContain('HTTP 500');
      expect(mockRepo.setResult).not.toHaveBeenCalledWith(1, SnipeResult.UNAVAILABLE);
    });

    it('hands the scheduler the provider’s access gate for queue warm-up', () => {
      expect(service.getAccessGate()).toBe(provider.access);
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
      provider.availability.check.mockResolvedValue(availability([{ unitId: '136', free: true }]));
      provider.holds.create.mockResolvedValue(held('1'));

      await service.execute(1);

      const stay: StayQuery = {
        arrival: '2026-07-19',
        departure: '2026-07-21',
        adults: 2,
        children: 1,
        infants: 1,
        concessions: 1,
        params: { gearType: 'campervan', numVehicles: 2, postcode: '6530' },
      };
      expect(provider.availability.check).toHaveBeenCalledWith('34', stay, {
        unitIds: ['136', '137'],
      });
      expect(provider.holds.create).toHaveBeenCalledWith({
        externalId: '34',
        unitId: '136',
        stay,
      });
    });

    it('marks a snipe whose stored dates are not calendar dates in error, without polling', async () => {
      mockRepo.findById.mockReturnValue(
        makeSnipe({ stay: { ...makeSnipe().stay, arrival: 'garbage' } })
      );

      const result = await service.execute(1);

      expect(result.result).toBe(SnipeResult.ERROR);
      expect(result.error).toMatch(/not calendar dates/);
      expect(provider.availability.check).not.toHaveBeenCalled();
      expect(mockRepo.setResult).toHaveBeenCalledWith(1, SnipeResult.ERROR, expect.any(String));
    });
  });

  describe('create', () => {
    it("computes releaseAt for DAILY_ROLLOVER mode with the provider's release policy", async () => {
      const created = makeSnipe();
      mockRepo.create.mockReturnValue(created);
      mockRepo.findById.mockReturnValue(created);

      await service.create(1, snipeInput({ name: 'Daily' }));

      expect(provider.release.computeReleaseAt).toHaveBeenCalledWith({
        mode: 'daily_rollover',
        externalId: '34',
        stay: {
          arrival: '2026-07-19',
          departure: '2026-07-21',
          adults: 2,
          children: 0,
          infants: 0,
          concessions: 0,
          params: { gearType: 'all', numVehicles: 1 },
        },
        now: expect.any(Date),
      });
      const passedInput = mockRepo.create.mock.calls[0][1];
      expect(passedInput.releaseAt.toISOString()).toBe('2026-01-19T18:00:00.000Z');
      // ParkStay's defaults for the stay fields the input left out
      expect(passedInput.stayParams).toEqual({ gearType: 'all', numVehicles: 1 });
    });

    it('recomputes releaseAt when an update changes the dates', async () => {
      const updated = makeSnipe({ stay: { ...makeSnipe().stay, arrival: '2026-08-01' } });
      mockRepo.update.mockReturnValue(updated);

      await service.update(1, {
        stay: { arrival: '2026-08-01', departure: '2026-08-03', adults: 2 },
      });

      expect(provider.release.computeReleaseAt).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'daily_rollover',
          stay: expect.objectContaining({ arrival: '2026-08-01' }),
        })
      );
      expect(mockRepo.update).toHaveBeenLastCalledWith(1, {
        releaseAt: new Date('2026-01-19T18:00:00.000Z'),
      });
    });

    it('arms the scheduler with the stored release (and none for cancellation)', () => {
      const releaseAt = new Date('2026-01-19T18:00:00.000Z');
      expect(service.computeReleaseAt(makeSnipe({ releaseAt }))).toBe(releaseAt);
      expect(
        service.computeReleaseAt(
          makeSnipe({ releaseMode: SnipeReleaseMode.CANCELLATION, releaseAt })
        )
      ).toBeUndefined();
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
