/**
 * BookingService Unit Tests
 * Tests booking management operations (CRUD, validation, statistics)
 */

import { BookingService } from '@main/services/booking/BookingService';
import { BookingRepository } from '@main/database/repositories/BookingRepository';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository } from '@main/database/repositories/UserRepository';
import {
  mockBookingInput,
  mockBooking,
  createMockBookingInput,
  createMultipleMockBookings,
  invalidBookingInputs,
} from '@tests/fixtures/bookings';
import { mockUserInput } from '@tests/fixtures/users';
import { BookingStatus } from '@shared/types';
import { expectAsyncThrow } from '@tests/utils/test-helpers';

describe('BookingService', () => {
  let dbHelper: TestDatabaseHelper;
  let bookingService: BookingService;
  let bookingRepository: BookingRepository;
  let userRepository: UserRepository;
  let testUserId: number;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('booking-service');
    await dbHelper.setup();

    bookingRepository = new BookingRepository(dbHelper.getDb());
    bookingService = new BookingService(bookingRepository);

    // Create test user
    userRepository = new UserRepository(dbHelper.getDb());
    const user = userRepository.create(
      mockUserInput.email,
      'encrypted',
      'key',
      'iv',
      'tag',
      {
        firstName: mockUserInput.firstName,
        lastName: mockUserInput.lastName,
      }
    );
    testUserId = user.id;
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  describe('createBooking', () => {
    it('should create a new booking', async () => {
      const booking = await bookingService.createBooking(testUserId, mockBookingInput);

      expect(booking).toBeDefined();
      expect(booking.id).toBeDefined();
      expect(booking.userId).toBe(testUserId);
      expect(booking.bookingReference).toBe(mockBookingInput.bookingReference);
      expect(booking.parkName).toBe(mockBookingInput.parkName);
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
    });

    it('should throw error for duplicate booking reference', async () => {
      await bookingService.createBooking(testUserId, mockBookingInput);

      await expectAsyncThrow(
        () => bookingService.createBooking(testUserId, mockBookingInput),
        'already exists'
      );
    });

    it('should validate booking input', async () => {
      for (const invalidInput of invalidBookingInputs) {
        const { expectedError, ...input } = invalidInput;
        await expectAsyncThrow(
          () => bookingService.createBooking(testUserId, input as any),
          expectedError
        );
      }
    });

    it('should calculate num_nights correctly', async () => {
      const input = createMockBookingInput({
        arrivalDate: new Date('2024-06-01'),
        departureDate: new Date('2024-06-04'),
      });

      const booking = await bookingService.createBooking(testUserId, input);
      expect(booking.numNights).toBe(3);
    });

    it('should handle bookings with no cost', async () => {
      const input = createMockBookingInput({
        totalCost: undefined,
      });

      const booking = await bookingService.createBooking(testUserId, input);
      expect(booking.totalCost).toBeNull();
    });
  });

  describe('getBooking', () => {
    it('should retrieve booking by ID', async () => {
      const created = await bookingService.createBooking(testUserId, mockBookingInput);
      const retrieved = await bookingService.getBooking(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.bookingReference).toBe(mockBookingInput.bookingReference);
    });

    it('should return null for non-existent booking', async () => {
      const booking = await bookingService.getBooking(999999);
      expect(booking).toBeNull();
    });
  });

  describe('getBookingByReference', () => {
    it('should retrieve booking by reference', async () => {
      await bookingService.createBooking(testUserId, mockBookingInput);
      const retrieved = await bookingService.getBookingByReference(
        mockBookingInput.bookingReference
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.bookingReference).toBe(mockBookingInput.bookingReference);
    });

    it('should return null for non-existent reference', async () => {
      const booking = await bookingService.getBookingByReference('NONEXISTENT');
      expect(booking).toBeNull();
    });
  });

  describe('listBookings', () => {
    it('should list all bookings for user', async () => {
      const input1 = createMockBookingInput();
      const input2 = createMockBookingInput();
      const input3 = createMockBookingInput();

      await bookingService.createBooking(testUserId, input1);
      await bookingService.createBooking(testUserId, input2);
      await bookingService.createBooking(testUserId, input3);

      const bookings = await bookingService.listBookings(testUserId);
      expect(bookings).toHaveLength(3);
    });

    it('should return empty array if no bookings', async () => {
      const bookings = await bookingService.listBookings(testUserId);
      expect(bookings).toHaveLength(0);
    });

    it('should only return bookings for specific user', async () => {
      // Create another user
      const user2 = userRepository.create('user2@test.com', 'enc', 'key', 'iv', 'tag');

      await bookingService.createBooking(testUserId, createMockBookingInput());
      await bookingService.createBooking(user2.id, createMockBookingInput());

      const user1Bookings = await bookingService.listBookings(testUserId);
      const user2Bookings = await bookingService.listBookings(user2.id);

      expect(user1Bookings).toHaveLength(1);
      expect(user2Bookings).toHaveLength(1);
    });
  });

  describe('getUpcomingBookings', () => {
    it('should return only upcoming bookings', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const laterDate = new Date(futureDate);
      laterDate.setDate(laterDate.getDate() + 3);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);
      const pastDeparture = new Date(pastDate);
      pastDeparture.setDate(pastDeparture.getDate() + 2);

      await bookingService.createBooking(
        testUserId,
        createMockBookingInput({
          arrivalDate: futureDate,
          departureDate: laterDate,
        })
      );

      await bookingService.createBooking(
        testUserId,
        createMockBookingInput({
          arrivalDate: pastDate,
          departureDate: pastDeparture,
        })
      );

      const upcoming = await bookingService.getUpcomingBookings(testUserId);
      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].arrivalDate).toEqual(futureDate);
    });
  });

  describe('getPastBookings', () => {
    it('should return only past bookings', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const laterDate = new Date(futureDate);
      laterDate.setDate(laterDate.getDate() + 3);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);
      const pastDeparture = new Date(pastDate);
      pastDeparture.setDate(pastDeparture.getDate() + 2);

      await bookingService.createBooking(
        testUserId,
        createMockBookingInput({
          arrivalDate: futureDate,
          departureDate: laterDate,
        })
      );

      await bookingService.createBooking(
        testUserId,
        createMockBookingInput({
          arrivalDate: pastDate,
          departureDate: pastDeparture,
        })
      );

      const past = await bookingService.getPastBookings(testUserId);
      expect(past).toHaveLength(1);
      expect(past[0].arrivalDate).toEqual(pastDate);
    });
  });

  describe('updateBooking', () => {
    it('should update booking details', async () => {
      const booking = await bookingService.createBooking(testUserId, mockBookingInput);

      const updated = await bookingService.updateBooking(booking.id, {
        siteNumber: '99',
        notes: 'Updated notes',
      });

      expect(updated.siteNumber).toBe('99');
      expect(updated.notes).toBe('Updated notes');
      expect(updated.bookingReference).toBe(mockBookingInput.bookingReference);
    });

    it('should throw error for non-existent booking', async () => {
      await expectAsyncThrow(
        () => bookingService.updateBooking(999999, { notes: 'test' }),
        'not found'
      );
    });

    it('should validate date changes', async () => {
      const booking = await bookingService.createBooking(testUserId, mockBookingInput);

      await expectAsyncThrow(
        () =>
          bookingService.updateBooking(booking.id, {
            arrivalDate: new Date('2024-06-05'),
            departureDate: new Date('2024-06-01'),
          }),
        'Departure date must be after arrival date'
      );
    });
  });

  describe('cancelBooking', () => {
    it('should cancel an active booking', async () => {
      const booking = await bookingService.createBooking(testUserId, mockBookingInput);

      const cancelled = await bookingService.cancelBooking(booking.id);

      expect(cancelled.status).toBe(BookingStatus.CANCELLED);
    });

    it('should throw error if already cancelled', async () => {
      const booking = await bookingService.createBooking(testUserId, mockBookingInput);
      await bookingService.cancelBooking(booking.id);

      await expectAsyncThrow(
        () => bookingService.cancelBooking(booking.id),
        'already cancelled'
      );
    });

    it('should throw error for non-existent booking', async () => {
      await expectAsyncThrow(() => bookingService.cancelBooking(999999), 'not found');
    });
  });

  describe('deleteBooking', () => {
    it('should delete booking', async () => {
      const booking = await bookingService.createBooking(testUserId, mockBookingInput);

      await bookingService.deleteBooking(booking.id);

      const retrieved = await bookingService.getBooking(booking.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error for non-existent booking', async () => {
      await expectAsyncThrow(() => bookingService.deleteBooking(999999), 'not found');
    });
  });

  describe('getBookingStats', () => {
    it('should calculate booking statistics', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const laterDate = new Date(futureDate);
      laterDate.setDate(laterDate.getDate() + 3);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7);
      const pastDeparture = new Date(pastDate);
      pastDeparture.setDate(pastDeparture.getDate() + 2);

      // Create upcoming booking
      await bookingService.createBooking(
        testUserId,
        createMockBookingInput({
          arrivalDate: futureDate,
          departureDate: laterDate,
        })
      );

      // Create past booking
      await bookingService.createBooking(
        testUserId,
        createMockBookingInput({
          arrivalDate: pastDate,
          departureDate: pastDeparture,
        })
      );

      // Create cancelled booking
      const cancelled = await bookingService.createBooking(
        testUserId,
        createMockBookingInput()
      );
      await bookingService.cancelBooking(cancelled.id);

      const stats = await bookingService.getBookingStats(testUserId);

      expect(stats.total).toBe(3);
      expect(stats.upcoming).toBe(1);
      expect(stats.past).toBe(1);
      expect(stats.cancelled).toBe(1);
    });

    it('should return zero stats for user with no bookings', async () => {
      const stats = await bookingService.getBookingStats(testUserId);

      expect(stats.total).toBe(0);
      expect(stats.upcoming).toBe(0);
      expect(stats.past).toBe(0);
      expect(stats.cancelled).toBe(0);
    });
  });
});
