/**
 * WatchService Unit Tests
 */

import { WatchService } from '@main/services/watch/watch.service';
import { WatchRepository } from '@main/database/repositories';
import { ParkStayService } from '@main/services/parkstay/parkstay.service';
import { NotificationService } from '@main/services/notification/notification.service';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository } from '@main/database/repositories/UserRepository';
import { mockWatchInput, createMockWatchInput } from '@tests/fixtures/watches';
import { mockUserInput } from '@tests/fixtures/users';
import { MockParkStayAPI } from '@tests/utils/mock-api';
import { expectAsyncThrow } from '@tests/utils/test-helpers';
import { WatchResult } from '@shared/types/common.types';

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
    notificationService = new NotificationService() as jest.Mocked<NotificationService>;

    watchService = new WatchService(parkStayService, notificationService);
  });

  afterEach(async () => {
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
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await expectAsyncThrow(
        () =>
          watchService.create(testUserId, {
            ...createMockWatchInput(),
            arrivalDate: pastDate,
          }),
        'Arrival date must be in the future'
      );
    });

    it('should reject watch with departure before arrival', async () => {
      const arrival = new Date();
      arrival.setDate(arrival.getDate() + 10);
      const departure = new Date();
      departure.setDate(departure.getDate() + 5);

      await expectAsyncThrow(
        () =>
          watchService.create(testUserId, {
            ...createMockWatchInput(),
            arrivalDate: arrival,
            departureDate: departure,
          }),
        'Departure date must be after arrival date'
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
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() + 1);
      const futureDate = new Date(pastDate);
      futureDate.setDate(futureDate.getDate() + 3);

      const input = createMockWatchInput({
        arrivalDate: pastDate,
        departureDate: futureDate,
      });

      const watch = await watchService.create(testUserId, input);

      // Simulate time passing
      jest.useFakeTimers();
      jest.setSystemTime(new Date(pastDate.getTime() + 2 * 24 * 60 * 60 * 1000));

      const result = await watchService.execute(watch.id);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('arrival date has passed');

      const updatedWatch = await watchService.get(watch.id);
      expect(updatedWatch?.isActive).toBe(false);

      jest.useRealTimers();
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
