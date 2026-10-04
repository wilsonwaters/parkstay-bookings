/**
 * WatchService Unit Tests. The provider is a stub with one availability call;
 * `tests/integration/watch-parkstay.test.ts` runs a watch against the real ParkStay module.
 */

import { WatchService, type WatchProvider } from '@main/services/watch/watch.service';
import { WatchRepository } from '@main/database/repositories';
import { NotificationService } from '@main/services/notification/notification.service';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository } from '@main/database/repositories/user.repository';
import { createMockWatchInput } from '@tests/fixtures/watches';
import { mockUserInput } from '@tests/fixtures/users';
import { expectAsyncThrow } from '@tests/utils/test-helpers';
import { WatchResult } from '@shared/types/common.types';
import { AvailabilityResult } from '@shared/types';
import type { LocationAvailability, NightState } from '@shared/types/provider.types';
import { addDays, eachNight, todayIn } from '@shared/utils/calendar-date';

/** The calendar date `days` days from today in Perth, where ParkStay's dates are. */
const inDays = (days: number): string => addDays(todayIn('Australia/Perth'), days);

/**
 * The provider's answer for a stay: each unit's night states, in order, at `price` a night.
 * A unit is fully available when every night is.
 */
function availability(
  stay: { arrival: string; departure: string },
  units: Record<string, NightState[]>,
  price = 35
): LocationAvailability {
  const dates = eachNight(stay.arrival, stay.departure);
  return {
    key: 'parkstay:CG001',
    checkedAt: new Date().toISOString(),
    release: { open: true },
    units: Object.entries(units).map(([unitId, states]) => ({
      unitId,
      unitName: `Site ${unitId}`,
      nights: dates.map((date, i) => ({ date, state: states[i], price })),
      fullyAvailable: states.every((state) => state === 'available'),
    })),
  };
}

const FREE: NightState[] = ['available', 'available', 'available', 'available'];
const BOOKED: NightState[] = ['booked', 'booked', 'booked', 'booked'];

// Mock the services
jest.mock('@main/services/notification/notification.service');

describe('WatchService', () => {
  let dbHelper: TestDatabaseHelper;
  let watchService: WatchService;
  let check: jest.Mock;
  let notificationService: jest.Mocked<NotificationService>;
  let testUserId: number;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('watch-service');
    await dbHelper.setup();

    // Create test user
    const userRepo = new UserRepository(dbHelper.getDb());
    const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');
    testUserId = user.id;

    // A stub provider and a mocked notification service
    check = jest.fn();
    notificationService = new NotificationService(null as any) as jest.Mocked<NotificationService>;

    watchService = new WatchService(
      new WatchRepository(dbHelper.getDb()),
      { availability: { check } } as unknown as WatchProvider,
      notificationService
    );
  });

  afterEach(async () => {
    jest.useRealTimers();
    await dbHelper.teardown();
  });

  describe('create', () => {
    it('should create a new watch', async () => {
      const input = createMockWatchInput();
      const watch = await watchService.create(testUserId, input);

      expect(watch).toBeDefined();
      expect(watch.id).toBeDefined();
      expect(watch.userId).toBe(testUserId);
      expect(watch.name).toBe(input.name);
      expect(watch.isActive).toBe(true);
    });

    it('should reject watch with past arrival date', async () => {
      await expectAsyncThrow(
        () =>
          watchService.create(testUserId, {
            ...createMockWatchInput(),
            stay: { arrival: inDays(-1), departure: inDays(2), adults: 2 },
          }),
        'Arrival date must be today or in the future'
      );
    });

    it('should accept a watch arriving today (in the provider time zone)', async () => {
      const watch = await watchService.create(
        testUserId,
        createMockWatchInput({ stay: { arrival: inDays(0), departure: inDays(1), adults: 2 } })
      );
      expect(watch.stay.arrival).toBe(inDays(0));
    });

    it('should reject watch with departure before arrival', async () => {
      await expectAsyncThrow(
        () =>
          watchService.create(testUserId, {
            ...createMockWatchInput(),
            stay: { arrival: inDays(10), departure: inDays(5), adults: 2 },
          }),
        'Departure date must be after arrival date'
      );
    });

    it('should reject dates that are not calendar dates', async () => {
      await expectAsyncThrow(
        () =>
          watchService.create(testUserId, {
            ...createMockWatchInput(),
            stay: { arrival: '2099-07-19T00:00:00.000Z', departure: '2099-07-21', adults: 2 },
          }),
        'Dates must be calendar dates (YYYY-MM-DD)'
      );
    });

    it('should reject a provider other than ParkStay', async () => {
      await expectAsyncThrow(
        () => watchService.create(testUserId, createMockWatchInput({ providerId: 'fake' })),
        'Watches are not available for fake'
      );
    });
  });

  describe('execute', () => {
    it('should execute watch and find availability, with the real nightly price', async () => {
      const input = createMockWatchInput();
      const watch = await watchService.create(testUserId, input);
      // The fixture watch wants sites "Site 1"–"Site 3" for 4 nights, at most $50 a night.
      check.mockResolvedValue(availability(watch.stay, { '1': FREE, '9': FREE }));

      notificationService.notifyWatchFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(result.availability).toEqual([
        {
          siteId: '1',
          siteName: 'Site 1',
          siteType: 'Unpowered',
          available: true,
          price: 35,
          dates: { arrival: watch.stay.arrival, departure: watch.stay.departure },
        },
      ]);
      expect(notificationService.notifyWatchFound).toHaveBeenCalledWith(watch, result.availability);
    });

    it('should execute watch and handle no availability', async () => {
      const input = createMockWatchInput();
      const watch = await watchService.create(testUserId, input);
      check.mockResolvedValue(availability(watch.stay, { '1': BOOKED }));

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(false);
      expect(notificationService.notifyWatchFound).not.toHaveBeenCalled();
    });

    it('leaves out sites over the price limit, night by night', async () => {
      const watch = await watchService.create(testUserId, createMockWatchInput({ maxPrice: 30 }));
      check.mockResolvedValue(availability(watch.stay, { '1': FREE }, 35));
      expect((await watchService.execute(watch.id)).found).toBe(false);

      check.mockResolvedValue(availability(watch.stay, { '1': FREE }, 30));
      expect((await watchService.execute(watch.id)).found).toBe(true);
    });

    it('keeps only the units the watch names, by id or name', async () => {
      const watch = await watchService.create(
        testUserId,
        createMockWatchInput({ unitIds: ['B', 'Site C'] })
      );
      check.mockResolvedValue(availability(watch.stay, { A: FREE, B: FREE, C: FREE }));

      const result = await watchService.execute(watch.id);

      expect(result.availability!.map((r) => r.siteId)).toEqual(['B', 'C']);
    });

    it('should deactivate watch if arrival date has passed', async () => {
      // Create watch with date that will be in past
      const input = createMockWatchInput({
        stay: { arrival: inDays(1), departure: inDays(4), adults: 2 },
      });

      const watch = await watchService.create(testUserId, input);

      // Simulate time passing
      jest.useFakeTimers();
      jest.setSystemTime(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('arrival date has passed');

      const updatedWatch = await watchService.get(watch.id);
      expect(updatedWatch?.isActive).toBe(false);
    });

    it('records an error when the provider fails', async () => {
      const watch = await watchService.create(testUserId, createMockWatchInput());
      check.mockRejectedValue(new Error('HTTP 500'));

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(false);
      expect((await watchService.get(watch.id))?.lastResult).toBe(WatchResult.ERROR);
    });
  });

  describe('execute on the provider-aware watch', () => {
    it('asks the provider for the location, calendar dates, party and stay fields', async () => {
      const watch = await watchService.create(
        testUserId,
        createMockWatchInput({
          location: { externalId: '88', name: 'Lucky Bay', areaName: 'Cape Le Grand' },
          stay: { arrival: inDays(20), departure: inDays(23), adults: 2, children: 1 },
          stayParams: { parkId: '42', gearType: 'tent' },
        })
      );
      check.mockResolvedValue(availability(watch.stay, {}));

      await watchService.execute(watch.id);

      expect(check).toHaveBeenCalledWith('88', {
        arrival: inDays(20),
        departure: inDays(23),
        adults: 2,
        children: 1,
        infants: 0,
        concessions: 0,
        params: { parkId: '42', gearType: 'tent' },
      });
    });

    it('marks a stored row whose dates are not calendar dates in error instead of throwing', async () => {
      const watch = await watchService.create(testUserId, createMockWatchInput());
      dbHelper
        .getDb()
        .prepare("UPDATE watches SET arrival_date = 'garbage' WHERE id = ?")
        .run(watch.id);

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/not calendar dates/);
      expect(check).not.toHaveBeenCalled();
      expect((await watchService.get(watch.id))?.lastResult).toBe(WatchResult.ERROR);
    });
  });

  describe('partial match', () => {
    it('should not report partial availability when allowPartialMatch is false', async () => {
      const input = createMockWatchInput({ allowPartialMatch: false });
      const watch = await watchService.create(testUserId, input);
      check.mockResolvedValue(
        availability(watch.stay, { '1': ['available', 'booked', 'available', 'available'] })
      );
      notificationService.notifyWatchPartialFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(false);
      expect(check).toHaveBeenCalledTimes(1);
      expect(notificationService.notifyWatchPartialFound).not.toHaveBeenCalled();
    });

    it('should not notify when allowPartialMatch is true but no nights are available', async () => {
      const input = createMockWatchInput({
        stay: { arrival: inDays(30), departure: inDays(32), adults: 2 }, // 2 nights
        allowPartialMatch: true,
      });
      const watch = await watchService.create(testUserId, input);
      check.mockResolvedValue(availability(watch.stay, { '1': ['booked', 'booked'] }));
      notificationService.notifyWatchPartialFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(false);
      expect(notificationService.notifyWatchPartialFound).not.toHaveBeenCalled();

      const updatedWatch = await watchService.get(watch.id);
      expect(updatedWatch?.lastResult).toBe(WatchResult.NOT_FOUND);
    });

    it('finds consecutive blocks of nights in the one availability call and sets PARTIAL_FOUND', async () => {
      const input = createMockWatchInput({
        stay: { arrival: inDays(30), departure: inDays(34), adults: 2 }, // 4 nights
        allowPartialMatch: true,
        notifyOnly: false,
      });
      const watch = await watchService.create(testUserId, input);
      check.mockResolvedValue(
        availability(watch.stay, {
          '1': ['available', 'booked', 'available', 'available'],
          '2': BOOKED,
        })
      );
      notificationService.notifyWatchPartialFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      // One request, not one per night.
      expect(check).toHaveBeenCalledTimes(1);
      expect(notificationService.notifyWatchPartialFound).toHaveBeenCalledTimes(1);

      const partialArg = (notificationService.notifyWatchPartialFound as jest.Mock).mock
        .calls[0][1] as AvailabilityResult[];
      expect(partialArg.map((r) => [r.siteId, r.dates, r.price, r.partial])).toEqual([
        ['1', { arrival: inDays(30), departure: inDays(31) }, 35, true],
        ['1', { arrival: inDays(32), departure: inDays(34) }, 35, true],
      ]);

      const updatedWatch = await watchService.get(watch.id);
      expect(updatedWatch?.lastResult).toBe(WatchResult.PARTIAL_FOUND);
      expect(updatedWatch?.lastAvailability?.[0].dates).toEqual(partialArg[0].dates);
    });

    it('should use the full match and not report partial blocks when a full match is found', async () => {
      const input = createMockWatchInput({ allowPartialMatch: true });
      const watch = await watchService.create(testUserId, input);
      check.mockResolvedValue(
        availability(watch.stay, {
          '1': FREE,
          '2': ['available', 'booked', 'available', 'available'],
        })
      );

      notificationService.notifyWatchFound = jest.fn();
      notificationService.notifyWatchPartialFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(check).toHaveBeenCalledTimes(1);
      expect(notificationService.notifyWatchFound).toHaveBeenCalledTimes(1);
      expect(notificationService.notifyWatchPartialFound).not.toHaveBeenCalled();

      const updatedWatch = await watchService.get(watch.id);
      expect(updatedWatch?.lastResult).toBe(WatchResult.FOUND);
    });
  });

  describe('activate/deactivate', () => {
    it('should activate a watch', async () => {
      const input = createMockWatchInput();
      const watch = await watchService.create(testUserId, input);

      await watchService.deactivate(watch.id);
      let updated = await watchService.get(watch.id);
      expect(updated?.isActive).toBe(false);

      await watchService.activate(watch.id);
      updated = await watchService.get(watch.id);
      expect(updated?.isActive).toBe(true);
    });
  });

  describe('getActiveWatches', () => {
    it('should return only active watches', async () => {
      const watch1 = await watchService.create(testUserId, createMockWatchInput());
      const watch2 = await watchService.create(testUserId, createMockWatchInput());
      await watchService.deactivate(watch2.id);

      const activeWatches = watchService.getActiveWatches();

      expect(activeWatches).toHaveLength(1);
      expect(activeWatches[0].id).toBe(watch1.id);
    });
  });
});
