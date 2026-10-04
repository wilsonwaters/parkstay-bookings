/**
 * WatchService Unit Tests
 */

import { WatchService } from '@main/services/watch/watch.service';
import { WatchRepository } from '@main/database/repositories';
import { ParkStayService } from '@main/services/parkstay/parkstay.service';
import { NotificationService } from '@main/services/notification/notification.service';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository } from '@main/database/repositories/user.repository';
import { createMockWatchInput } from '@tests/fixtures/watches';
import { mockUserInput } from '@tests/fixtures/users';
import { expectAsyncThrow } from '@tests/utils/test-helpers';
import { WatchResult } from '@shared/types/common.types';
import { AvailabilityResult } from '@shared/types';
import { addDays, todayIn } from '@shared/utils/calendar-date';

/** The calendar date `days` days from today in Perth, where ParkStay's dates are. */
const inDays = (days: number): string => addDays(todayIn('Australia/Perth'), days);

// Mock the services
jest.mock('@main/services/parkstay/parkstay.service');
jest.mock('@main/services/notification/notification.service');

describe('WatchService', () => {
  let dbHelper: TestDatabaseHelper;
  let watchService: WatchService;
  let parkStayService: jest.Mocked<ParkStayService>;
  let notificationService: jest.Mocked<NotificationService>;
  let testUserId: number;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('watch-service');
    await dbHelper.setup();

    // Create test user
    const userRepo = new UserRepository(dbHelper.getDb());
    const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');
    testUserId = user.id;

    // Create mocked services
    parkStayService = new ParkStayService(null as any) as jest.Mocked<ParkStayService>;
    notificationService = new NotificationService(null as any) as jest.Mocked<NotificationService>;

    watchService = new WatchService(
      new WatchRepository(dbHelper.getDb()),
      parkStayService,
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
    it('should execute watch and find availability', async () => {
      const input = createMockWatchInput();
      const watch = await watchService.create(testUserId, input);

      // Mock availability response with matches (siteType must match the watch fixture)
      parkStayService.checkAvailability = jest.fn().mockResolvedValue({
        available: true,
        sites: [
          {
            siteId: 'SITE001',
            siteName: 'Site 1',
            siteType: 'Unpowered',
            dates: [{ date: '2024-06-01', available: true, bookable: true, price: 35.0 }],
          },
        ],
        totalAvailable: 1,
        lowestPrice: 35.0,
      });

      notificationService.notifyWatchFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(result.availability).toBeDefined();
      expect(result.availability!.length).toBeGreaterThan(0);
      expect(notificationService.notifyWatchFound).toHaveBeenCalled();
    });

    it('should execute watch and handle no availability', async () => {
      const input = createMockWatchInput();
      const watch = await watchService.create(testUserId, input);

      // Mock no availability
      parkStayService.checkAvailability = jest.fn().mockResolvedValue({
        available: false,
        sites: [],
        totalAvailable: 0,
        lowestPrice: undefined,
      });

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(false);
      expect(notificationService.notifyWatchFound).not.toHaveBeenCalled();
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
  });

  describe('execute on the provider-aware watch', () => {
    const noAvailability = { available: false, sites: [], totalAvailable: 0 };

    it('maps the location, calendar dates, party and gear type onto the ParkStay call', async () => {
      const watch = await watchService.create(
        testUserId,
        createMockWatchInput({
          location: { externalId: '88', name: 'Lucky Bay', areaName: 'Cape Le Grand' },
          stay: { arrival: inDays(20), departure: inDays(23), adults: 2, children: 1 },
          stayParams: { parkId: '42', gearType: 'tent' },
        })
      );
      parkStayService.checkAvailability = jest.fn().mockResolvedValue(noAvailability);

      await watchService.execute(watch.id);

      expect(parkStayService.checkAvailability).toHaveBeenCalledWith('88', {
        campgroundId: '88',
        arrivalDate: inDays(20),
        departureDate: inDays(23),
        numGuests: 3,
        siteType: 'tent',
      });
    });

    it('marks a stored row whose dates are not calendar dates in error instead of throwing', async () => {
      const watch = await watchService.create(testUserId, createMockWatchInput());
      dbHelper
        .getDb()
        .prepare("UPDATE watches SET arrival_date = 'garbage' WHERE id = ?")
        .run(watch.id);
      parkStayService.checkAvailability = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(false);
      expect(result.error?.message).toMatch(/not calendar dates/);
      expect(parkStayService.checkAvailability).not.toHaveBeenCalled();
      expect((await watchService.get(watch.id))?.lastResult).toBe(WatchResult.ERROR);
    });
  });

  describe('partial match', () => {
    const noAvailability = {
      available: false,
      sites: [],
      totalAvailable: 0,
      lowestPrice: undefined,
    };
    const siteAvailable = (siteId = 'SITE001') => ({
      available: true,
      sites: [
        {
          siteId,
          siteName: 'Site 1',
          siteType: 'Unpowered',
          dates: [{ date: '', available: true, bookable: true, price: 35.0 }],
        },
      ],
      totalAvailable: 1,
      lowestPrice: 35.0,
    });

    it('should not check partial availability when allowPartialMatch is false', async () => {
      const input = createMockWatchInput({ allowPartialMatch: false });
      const watch = await watchService.create(testUserId, input);

      parkStayService.checkAvailability = jest.fn().mockResolvedValue(noAvailability);
      notificationService.notifyWatchPartialFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(false);
      // Only one call for the full range; no per-night calls
      expect(parkStayService.checkAvailability).toHaveBeenCalledTimes(1);
      expect(notificationService.notifyWatchPartialFound).not.toHaveBeenCalled();
    });

    it('should not notify when allowPartialMatch is true but no nights are available', async () => {
      const input = createMockWatchInput({
        stay: { arrival: inDays(30), departure: inDays(32), adults: 2 }, // 2 nights
        allowPartialMatch: true,
      });
      const watch = await watchService.create(testUserId, input);

      // All calls return nothing
      parkStayService.checkAvailability = jest.fn().mockResolvedValue(noAvailability);
      notificationService.notifyWatchPartialFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(false);
      expect(notificationService.notifyWatchPartialFound).not.toHaveBeenCalled();

      const updatedWatch = await watchService.get(watch.id);
      expect(updatedWatch?.lastResult).toBe(WatchResult.NOT_FOUND);
    });

    it('should call notifyWatchPartialFound and set PARTIAL_FOUND when a consecutive block is found', async () => {
      const input = createMockWatchInput({
        stay: { arrival: inDays(30), departure: inDays(32), adults: 2 }, // 2 nights
        allowPartialMatch: true,
        notifyOnly: false,
      });
      const watch = await watchService.create(testUserId, input);

      // Full range: not found; night 1: available; night 2: not available
      parkStayService.checkAvailability = jest
        .fn()
        .mockResolvedValueOnce(noAvailability) // full range
        .mockResolvedValueOnce(siteAvailable()) // night 1
        .mockResolvedValueOnce(noAvailability); // night 2

      notificationService.notifyWatchPartialFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      expect(notificationService.notifyWatchPartialFound).toHaveBeenCalledTimes(1);

      const partialArg = (notificationService.notifyWatchPartialFound as jest.Mock).mock
        .calls[0][1] as AvailabilityResult[];
      expect(partialArg.length).toBeGreaterThan(0);
      expect(partialArg[0].partial).toBe(true);
      // Night 1 only: the block is a calendar-date stay of one night
      expect(partialArg[0].dates).toEqual({ arrival: inDays(30), departure: inDays(31) });
      expect(parkStayService.checkAvailability).toHaveBeenNthCalledWith(
        2,
        'CG001',
        expect.objectContaining({ arrivalDate: inDays(30), departureDate: inDays(31) })
      );
      expect(parkStayService.checkAvailability).toHaveBeenNthCalledWith(
        3,
        'CG001',
        expect.objectContaining({ arrivalDate: inDays(31), departureDate: inDays(32) })
      );

      const updatedWatch = await watchService.get(watch.id);
      expect(updatedWatch?.lastResult).toBe(WatchResult.PARTIAL_FOUND);
      expect(updatedWatch?.lastAvailability?.[0].dates).toEqual(partialArg[0].dates);
    });

    it('should use full match path and not call checkPartialAvailability when full match is found', async () => {
      const input = createMockWatchInput({ allowPartialMatch: true });
      const watch = await watchService.create(testUserId, input);

      // Full range returns a match
      parkStayService.checkAvailability = jest.fn().mockResolvedValue({
        available: true,
        sites: [
          {
            siteId: 'SITE001',
            siteName: 'Site 1',
            siteType: 'Unpowered',
            dates: [{ date: '2024-06-01', available: true, bookable: true, price: 35.0 }],
          },
        ],
        totalAvailable: 1,
        lowestPrice: 35.0,
      });

      notificationService.notifyWatchFound = jest.fn();
      notificationService.notifyWatchPartialFound = jest.fn();

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(true);
      expect(result.found).toBe(true);
      // Only one API call for the full range
      expect(parkStayService.checkAvailability).toHaveBeenCalledTimes(1);
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
