/**
 * BookingService Unit Tests
 * Tests booking management operations (CRUD, validation, statistics)
 */

import { BookingService } from '@main/services/booking/BookingService';
import { BookingRepository } from '@main/database/repositories/booking.repository';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository } from '@main/database/repositories/user.repository';
import {
  mockBookingInput,
  createMockBookingInput,
  invalidBookingInputs,
} from '@tests/fixtures/bookings';
import { mockUserInput } from '@tests/fixtures/users';
import { BookingStatus } from '@shared/types';
import { expectAsyncThrow } from '@tests/utils/test-helpers';

// Fixed calendar dates far from today. BookingRepository.findUpcoming/findPast compare with
// SQLite date('now'), which Jest fake timers cannot pin, so the dates sit decades either
// side of any real "now".
const UPCOMING = { arrival: '2099-06-15', departure: '2099-06-18', adults: 2 };
const CANCELLED = { arrival: '2099-06-29', departure: '2099-07-01', adults: 2 };
const PAST = { arrival: '2000-06-15', departure: '2000-06-17', adults: 2 };

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
    const user = userRepository.create(mockUserInput.email, 'encrypted', {
      firstName: mockUserInput.firstName,
      lastName: mockUserInput.lastName,
    });
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
      expect(booking.providerId).toBe('parkstay');
      expect(booking.location).toEqual(mockBookingInput.location);
      expect(booking.stay).toEqual({
        ...mockBookingInput.stay,
        children: 0,
        infants: 0,
        concessions: 0,
      });
      expect(booking.unitIds).toEqual(['12']);
      expect(booking.stayParams).toEqual({ siteType: 'Unpowered' });
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
    });

    it('allows the same reference on another provider (unique per provider)', async () => {
      await bookingService.createBooking(testUserId, mockBookingInput);

      const other = await bookingService.createBooking(testUserId, {
        ...mockBookingInput,
        providerId: 'fake',
        location: { name: 'Elsewhere' },
      });

      expect(other.providerId).toBe('fake');
      expect(other.bookingReference).toBe(mockBookingInput.bookingReference);
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
        stay: { arrival: '2024-06-01', departure: '2024-06-04', adults: 2 },
      });

      const booking = await bookingService.createBooking(testUserId, input);
      expect(booking.numNights).toBe(3);
    });

    it('should handle bookings with no cost', async () => {
      const input = createMockBookingInput({
        totalCost: undefined,
      });

      const booking = await bookingService.createBooking(testUserId, input);
      expect(booking.totalCost).toBeUndefined();
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
        'parkstay',
        mockBookingInput.bookingReference
      );

      expect(retrieved).toBeDefined();
      expect(retrieved?.bookingReference).toBe(mockBookingInput.bookingReference);
    });

    it('should return null for non-existent reference', async () => {
      const booking = await bookingService.getBookingByReference('parkstay', 'NONEXISTENT');
      expect(booking).toBeNull();
      expect(
        await bookingService.getBookingByReference('fake', mockBookingInput.bookingReference)
      ).toBeNull();
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
      const user2 = userRepository.create('user2@test.com', 'enc');

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
      await bookingService.createBooking(testUserId, createMockBookingInput({ stay: UPCOMING }));

      await bookingService.createBooking(testUserId, createMockBookingInput({ stay: PAST }));

      const upcoming = await bookingService.getUpcomingBookings(testUserId);
      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].stay.arrival).toBe(UPCOMING.arrival);
    });
  });

  describe('getPastBookings', () => {
    it('should return only past bookings', async () => {
      await bookingService.createBooking(testUserId, createMockBookingInput({ stay: UPCOMING }));

      await bookingService.createBooking(testUserId, createMockBookingInput({ stay: PAST }));

      const past = await bookingService.getPastBookings(testUserId);
      expect(past).toHaveLength(1);
      expect(past[0].stay.arrival).toBe(PAST.arrival);
    });
  });

  describe('updateBooking', () => {
    it('should update booking details', async () => {
      const booking = await bookingService.createBooking(testUserId, mockBookingInput);

      const updated = await bookingService.updateBooking(booking.id, {
        unitIds: ['99'],
        notes: 'Updated notes',
      });

      expect(updated.unitIds).toEqual(['99']);
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
            stay: { arrival: '2024-06-05', departure: '2024-06-01', adults: 2 },
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

      await expectAsyncThrow(() => bookingService.cancelBooking(booking.id), 'already cancelled');
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
      // Create upcoming booking
      await bookingService.createBooking(testUserId, createMockBookingInput({ stay: UPCOMING }));

      // Create past booking
      await bookingService.createBooking(testUserId, createMockBookingInput({ stay: PAST }));

      // Create cancelled booking (with future dates so it's not counted as "past")
      const cancelled = await bookingService.createBooking(
        testUserId,
        createMockBookingInput({ stay: CANCELLED })
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
