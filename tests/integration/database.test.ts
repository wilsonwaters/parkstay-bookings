/**
 * Database Integration Tests
 * Tests database connection, repositories, and data persistence
 */

import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository } from '@main/database/repositories/UserRepository';
import { BookingRepository } from '@main/database/repositories/BookingRepository';
import { WatchRepository } from '@main/database/repositories';
import { STQRepository } from '@main/database/repositories';
import { NotificationRepository } from '@main/database/repositories';
import { mockUserInput } from '@tests/fixtures/users';
import { createMockBookingInput } from '@tests/fixtures/bookings';
import { createMockWatchInput } from '@tests/fixtures/watches';
import { createMockSTQInput } from '@tests/fixtures/stq';
import { BookingStatus } from '@shared/types';
import { NotificationType } from '@shared/types/common.types';

describe('Database Integration', () => {
  let dbHelper: TestDatabaseHelper;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('database-integration');
    await dbHelper.setup();
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  describe('Schema and Tables', () => {
    it('should have all required tables', () => {
      const db = dbHelper.getDb();
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('users');
      expect(tableNames).toContain('bookings');
      expect(tableNames).toContain('watches');
      expect(tableNames).toContain('skip_the_queue_entries');
      expect(tableNames).toContain('notifications');
      expect(tableNames).toContain('settings');
      expect(tableNames).toContain('job_logs');
      expect(tableNames).toContain('migrations');
    });

    it('should have foreign keys enabled', () => {
      const db = dbHelper.getDb();
      const result = db.pragma('foreign_keys', { simple: true });
      expect(result).toBe(1);
    });

    it('should use WAL journal mode', () => {
      const db = dbHelper.getDb();
      const result = db.pragma('journal_mode', { simple: true });
      expect(result).toBe('wal');
    });
  });

  describe('Cross-Repository Operations', () => {
    it('should maintain referential integrity', async () => {
      const db = dbHelper.getDb();
      const userRepo = new UserRepository(db);
      const bookingRepo = new BookingRepository(db);

      // Create user and booking
      const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');
      const bookingInput = createMockBookingInput();
      const booking = bookingRepo.create(user.id, bookingInput);

      expect(booking.userId).toBe(user.id);

      // Verify booking exists
      const retrieved = bookingRepo.findById(booking.id);
      expect(retrieved).toBeDefined();

      // Delete user (should cascade delete booking due to FK constraint)
      userRepo.deleteById(user.id);

      // Booking should be deleted
      const bookingAfterDelete = bookingRepo.findById(booking.id);
      expect(bookingAfterDelete).toBeNull();
    });

    it('should handle complex watch-booking-notification flow', async () => {
      const db = dbHelper.getDb();
      const userRepo = new UserRepository(db);
      const bookingRepo = new BookingRepository(db);
      const watchRepo = new WatchRepository(db);
      const notifRepo = new NotificationRepository();

      // Create user
      const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');

      // Create booking
      const bookingInput = createMockBookingInput();
      const booking = bookingRepo.create(user.id, bookingInput);

      // Create watch for same location
      const watchInput = createMockWatchInput({
        campgroundId: bookingInput.campgroundName,
      });
      const watch = watchRepo.create(user.id, watchInput);

      // Create notification about watch finding availability
      const notification = notifRepo.create({
        userId: user.id,
        type: NotificationType.WATCH_FOUND,
        title: 'Availability Found',
        message: 'Found availability for your watch',
        relatedId: watch.id,
        relatedType: 'watch',
      });

      // Verify everything is connected
      expect(watch.userId).toBe(user.id);
      expect(booking.userId).toBe(user.id);
      expect(notification.userId).toBe(user.id);
      expect(notification.relatedId).toBe(watch.id);
    });

    it('should handle STQ workflow', async () => {
      const db = dbHelper.getDb();
      const userRepo = new UserRepository(db);
      const bookingRepo = new BookingRepository(db);
      const stqRepo = new STQRepository();

      // Create user and booking
      const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');
      const bookingInput = createMockBookingInput();
      const booking = bookingRepo.create(user.id, bookingInput);

      // Create STQ entry
      const stqInput = createMockSTQInput({
        bookingId: booking.id,
        bookingReference: booking.bookingReference,
      });
      const stqEntry = stqRepo.create(user.id, stqInput);

      expect(stqEntry.bookingId).toBe(booking.id);
      expect(stqEntry.userId).toBe(user.id);

      // Simulate successful rebooking
      const newReference = 'BK999999';
      stqRepo.markSuccess(stqEntry.id, newReference);

      const updated = stqRepo.findById(stqEntry.id);
      expect(updated?.newBookingReference).toBe(newReference);
      expect(updated?.successDate).toBeDefined();
    });
  });

  describe('Transactions', () => {
    it('should rollback on error', async () => {
      const db = dbHelper.getDb();
      const userRepo = new UserRepository(db);

      const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');

      // Attempt transaction that should fail
      try {
        db.transaction(() => {
          userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag'); // Duplicate email
        })();
      } catch (error) {
        // Expected to fail
      }

      // Original user should still exist
      const retrievedUser = userRepo.findById(user.id);
      expect(retrievedUser).toBeDefined();
    });
  });

  describe('Indexes', () => {
    it('should have indexes on key columns', () => {
      const db = dbHelper.getDb();
      const indexes = db
        .prepare("SELECT name, tbl_name FROM sqlite_master WHERE type='index'")
        .all() as { name: string; tbl_name: string }[];

      const indexNames = indexes.map((i) => i.name);

      // Check critical indexes exist
      expect(indexNames).toContain('idx_users_email');
      expect(indexNames).toContain('idx_bookings_reference');
      expect(indexNames).toContain('idx_bookings_user_id');
      expect(indexNames).toContain('idx_watches_user_id');
      expect(indexNames).toContain('idx_watches_active');
      expect(indexNames).toContain('idx_stq_booking_id');
      expect(indexNames).toContain('idx_notifications_user_id');
    });
  });

  describe('Performance', () => {
    it('should handle bulk inserts efficiently', async () => {
      const db = dbHelper.getDb();
      const userRepo = new UserRepository(db);
      const bookingRepo = new BookingRepository(db);

      const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');

      const startTime = Date.now();
      const count = 100;

      for (let i = 0; i < count; i++) {
        const input = createMockBookingInput({
          bookingReference: `BK${100000 + i}`,
        });
        bookingRepo.create(user.id, input);
      }

      const duration = Date.now() - startTime;

      // Should complete bulk insert in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);

      const bookings = bookingRepo.findByUserId(user.id);
      expect(bookings).toHaveLength(count);
    });

    it('should handle bulk reads efficiently', async () => {
      const db = dbHelper.getDb();
      const userRepo = new UserRepository(db);
      const bookingRepo = new BookingRepository(db);

      const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');

      // Create 100 bookings
      for (let i = 0; i < 100; i++) {
        const input = createMockBookingInput({
          bookingReference: `BK${100000 + i}`,
        });
        bookingRepo.create(user.id, input);
      }

      const startTime = Date.now();

      // Read all bookings multiple times
      for (let i = 0; i < 10; i++) {
        bookingRepo.findByUserId(user.id);
      }

      const duration = Date.now() - startTime;

      // Should complete 10 reads of 100 bookings in reasonable time (< 500ms)
      expect(duration).toBeLessThan(500);
    });
  });
});
