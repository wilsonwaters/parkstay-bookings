/**
 * The finders that used to take raw SQL condition strings now run explicit
 * prepared statements with every value, enums included, bound as a `?` parameter.
 */

import Database from 'better-sqlite3';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import {
  BookingRepository,
  NotificationRepository,
  SiteSniperRepository,
  UserRepository,
  WatchRepository,
} from '@main/database/repositories';
import { mockUserInput, mockUserInput2 } from '@tests/fixtures/users';
import { createMockWatchInput } from '@tests/fixtures/watches';
import { createMockSiteSnipeInput } from '@tests/fixtures/site-sniper';
import { NotificationType, SnipeReleaseMode, SnipeStatus } from '@shared/types/common.types';

describe('parameterised repository SQL', () => {
  let dbHelper: TestDatabaseHelper;
  let db: Database.Database;
  let userId: number;
  let otherUserId: number;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('parameterised-sql');
    db = await dbHelper.setup();
    const users = new UserRepository(db);
    userId = users.create(mockUserInput.email, 'enc').id;
    otherUserId = users.create(mockUserInput2.email, 'enc').id;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await dbHelper.teardown();
  });

  /** SQL text of every statement prepared while `fn` runs. */
  function preparedSql(fn: () => void): string[] {
    const spy = jest.spyOn(db, 'prepare');
    fn();
    const sql = spy.mock.calls.map(([text]) => text);
    spy.mockRestore();
    return sql;
  }

  it('WatchRepository.findByUserId returns only that user’s watches', () => {
    const watches = new WatchRepository(db);
    const mine = watches.create(userId, createMockWatchInput({ name: 'Mine' }));
    watches.create(otherUserId, createMockWatchInput({ name: 'Theirs' }));

    expect(watches.findByUserId(userId).map((w) => w.id)).toEqual([mine.id]);
    expect(watches.findByUserId(12345)).toEqual([]);
  });

  it('WatchRepository.findActive and findDueForCheck filter by state and due time', () => {
    const watches = new WatchRepository(db);
    const due = watches.create(userId, createMockWatchInput({ name: 'Due' }));
    const later = watches.create(userId, createMockWatchInput({ name: 'Later' }));
    const inactive = watches.create(userId, createMockWatchInput({ name: 'Inactive' }));
    watches.updateCheckTimestamps(later.id, new Date(), new Date(Date.now() + 3600_000));
    watches.deactivate(inactive.id);

    expect(watches.findActive().map((w) => w.id)).toEqual([due.id, later.id]);
    expect(watches.findDueForCheck().map((w) => w.id)).toEqual([due.id]);
  });

  it('WatchRepository round-trips an empty preferred-sites list as JSON, not NULL', () => {
    const watches = new WatchRepository(db);
    const watch = watches.create(userId, createMockWatchInput({ preferredSites: [] }));

    expect(watches.findById(watch.id)?.preferredSites).toEqual([]);
  });

  it('SiteSniperRepository.findArmed binds the statuses as parameters', () => {
    const snipes = new SiteSniperRepository(db);
    const armed = snipes.create(userId, createMockSiteSnipeInput({ name: 'Armed' }));
    const waiting = snipes.create(userId, createMockSiteSnipeInput({ name: 'Waiting' }));
    const held = snipes.create(userId, createMockSiteSnipeInput({ name: 'Held' }));
    snipes.updateStatus(waiting.id, SnipeStatus.WAITING_RELEASE);
    snipes.updateStatus(held.id, SnipeStatus.HELD);

    let found: number[] = [];
    const sql = preparedSql(() => {
      found = snipes.findArmed().map((s) => s.id);
    });

    expect(found).toEqual([armed.id, waiting.id]);
    expect(sql).toEqual(['SELECT * FROM site_snipes WHERE is_active = 1 AND status IN (?, ?)']);
  });

  it('SiteSniperRepository.findDueForCheck binds the release mode and returns newest-first lists', () => {
    const snipes = new SiteSniperRepository(db);
    const cancellation = snipes.create(
      userId,
      createMockSiteSnipeInput({ name: 'C', releaseMode: SnipeReleaseMode.CANCELLATION })
    );
    snipes.create(userId, createMockSiteSnipeInput({ name: 'D' }));
    db.prepare("UPDATE site_snipes SET created_at = '2000-01-01 00:00:00' WHERE id = ?").run(
      cancellation.id
    );

    let due: number[] = [];
    const sql = preparedSql(() => {
      due = snipes.findDueForCheck().map((s) => s.id);
    });

    expect(due).toEqual([cancellation.id]);
    expect(sql).toHaveLength(1);
    expect(sql[0]).toContain('release_mode = ?');
    expect(sql[0]).not.toContain(SnipeReleaseMode.CANCELLATION);
    expect(snipes.findByUserId(userId).map((s) => s.name)).toEqual(['D', 'C']);
    expect(snipes.findById(cancellation.id)?.targetSiteIds).toEqual(['136', '137']);
  });

  it('NotificationRepository counts and deletes with bound parameters', () => {
    const notifications = new NotificationRepository(db);
    const create = (uid: number) =>
      notifications.create({
        userId: uid,
        type: NotificationType.INFO,
        title: 't',
        message: 'm',
      });
    const read = create(userId);
    create(userId);
    create(otherUserId);
    notifications.markAsRead(read.id);
    db.prepare("UPDATE notifications SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(
      read.id
    );

    expect(notifications.getUnreadCount(userId)).toBe(1);
    expect(notifications.deleteOld(30)).toBe(1);
    expect(notifications.deleteAllForUser(userId)).toBe(1);
    expect(notifications.getUnreadCount(otherUserId)).toBe(1);
  });

  it('BookingRepository reads booking_data JSON, including falsy JSON values', () => {
    const bookings = new BookingRepository(db);
    const insert = db.prepare(
      `INSERT INTO bookings (user_id, booking_reference, park_name, campground_name,
         arrival_date, departure_date, num_nights, num_guests, status, booking_data)
       VALUES (?, ?, 'Park', 'Camp', '2026-01-01', '2026-01-02', 1, 2, 'confirmed', ?)`
    );
    const withData = insert.run(userId, 'REF-1', '{"gearType":"tent"}').lastInsertRowid as number;
    const withFalse = insert.run(userId, 'REF-2', 'false').lastInsertRowid as number;

    expect(bookings.findById(withData)?.bookingData).toEqual({ gearType: 'tent' });
    expect(bookings.findById(withFalse)?.bookingData).toBe(false);
  });
});
