/**
 * SiteSniperRepository unit tests (backed by a real test database).
 */

import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository } from '@main/database/repositories/UserRepository';
import { SiteSniperRepository } from '@main/database/repositories';
import { mockUserInput } from '@tests/fixtures/users';
import { createMockSiteSnipeInput } from '@tests/fixtures/site-sniper';
import { SnipeReleaseMode, SnipeResult, SnipeStatus } from '@shared/types/common.types';

describe('SiteSniperRepository', () => {
  let dbHelper: TestDatabaseHelper;
  let repo: SiteSniperRepository;
  let userId: number;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('site-sniper-repo');
    await dbHelper.setup();

    const userRepo = new UserRepository(dbHelper.getDb());
    const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');
    userId = user.id;

    repo = new SiteSniperRepository();
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  describe('create', () => {
    it('creates a snipe with defaults and armed status', () => {
      const snipe = repo.create(userId, createMockSiteSnipeInput());

      expect(snipe.id).toBeGreaterThan(0);
      expect(snipe.userId).toBe(userId);
      expect(snipe.status).toBe(SnipeStatus.ARMED);
      expect(snipe.isActive).toBe(true);
      expect(snipe.targetSiteIds).toEqual(['136', '137']);
      expect(snipe.numAdult).toBe(2);
      expect(snipe.numVehicle).toBe(1);
      expect(snipe.maxAttempts).toBe(0);
    });

    it('applies defaults when optional fields are omitted', () => {
      const snipe = repo.create(userId, {
        name: 'Minimal',
        campgroundId: '99',
        arrivalDate: new Date('2026-09-01T00:00:00Z'),
        departureDate: new Date('2026-09-03T00:00:00Z'),
        releaseMode: SnipeReleaseMode.DAILY_ROLLOVER,
      });

      expect(snipe.siteType).toBe('all');
      expect(snipe.targetSiteIds).toEqual([]);
      expect(snipe.leadTimeSeconds).toBe(120);
      expect(snipe.pollIntervalMs).toBe(1500);
      expect(snipe.windowDurationMs).toBe(900000);
      expect(snipe.queueEnabled).toBe(false);
    });
  });

  describe('find methods', () => {
    it('findByUserId returns the user snipes', () => {
      repo.create(userId, createMockSiteSnipeInput({ name: 'A' }));
      repo.create(userId, createMockSiteSnipeInput({ name: 'B' }));

      const snipes = repo.findByUserId(userId);
      expect(snipes).toHaveLength(2);
    });

    it('findArmed returns only armed/waiting active snipes', () => {
      const armed = repo.create(userId, createMockSiteSnipeInput({ name: 'Armed' }));
      const held = repo.create(userId, createMockSiteSnipeInput({ name: 'Held' }));
      repo.setHeld(held.id, '1', new Date(), 'url');

      const results = repo.findArmed();
      expect(results.map((s) => s.id)).toContain(armed.id);
      expect(results.map((s) => s.id)).not.toContain(held.id);
    });

    it('findDueForCheck returns only cancellation-mode active snipes that are due', () => {
      const cancellation = repo.create(
        userId,
        createMockSiteSnipeInput({
          name: 'Cancellation',
          releaseMode: SnipeReleaseMode.CANCELLATION,
        })
      );
      repo.create(
        userId,
        createMockSiteSnipeInput({ name: 'Daily', releaseMode: SnipeReleaseMode.DAILY_ROLLOVER })
      );

      // No next_check_at yet → due.
      const due = repo.findDueForCheck();
      expect(due.map((s) => s.id)).toEqual([cancellation.id]);

      // Set next check in the future → no longer due.
      repo.updateCheckTimestamps(
        cancellation.id,
        new Date(),
        new Date(Date.now() + 60 * 60 * 1000)
      );
      expect(repo.findDueForCheck()).toHaveLength(0);
    });
  });

  describe('status transitions', () => {
    it('updateStatus changes the status', () => {
      const snipe = repo.create(userId, createMockSiteSnipeInput());
      repo.updateStatus(snipe.id, SnipeStatus.SNIPING);
      expect(repo.findById(snipe.id)!.status).toBe(SnipeStatus.SNIPING);
    });

    it('setHeld records the hold and marks status HELD', () => {
      const snipe = repo.create(userId, createMockSiteSnipeInput());
      const expiresAt = new Date('2026-01-19T16:30:00Z');
      repo.setHeld(snipe.id, '555', expiresAt, 'https://pay/', '136');

      const updated = repo.findById(snipe.id)!;
      expect(updated.status).toBe(SnipeStatus.HELD);
      expect(updated.lastResult).toBe(SnipeResult.HELD);
      expect(updated.heldBookingPk).toBe('555');
      expect(updated.paymentUrl).toBe('https://pay/');
      expect(updated.heldExpiresAt?.toISOString()).toBe(expiresAt.toISOString());
    });

    it('setBooked records the reference and deactivates', () => {
      const snipe = repo.create(userId, createMockSiteSnipeInput());
      repo.setBooked(snipe.id, 'PS0098765');

      const updated = repo.findById(snipe.id)!;
      expect(updated.status).toBe(SnipeStatus.BOOKED);
      expect(updated.bookedReference).toBe('PS0098765');
      expect(updated.isActive).toBe(false);
    });

    it('setResult records the last result and error', () => {
      const snipe = repo.create(userId, createMockSiteSnipeInput());
      repo.setResult(snipe.id, SnipeResult.UNAVAILABLE, 'race lost');

      const updated = repo.findById(snipe.id)!;
      expect(updated.lastResult).toBe(SnipeResult.UNAVAILABLE);
      expect(updated.lastError).toBe('race lost');
    });

    it('deactivate disables an armed snipe but preserves held status', () => {
      const armed = repo.create(userId, createMockSiteSnipeInput());
      repo.deactivate(armed.id);
      expect(repo.findById(armed.id)!.status).toBe(SnipeStatus.DISABLED);

      const held = repo.create(userId, createMockSiteSnipeInput());
      repo.setHeld(held.id, '1', new Date(), 'url');
      repo.deactivate(held.id);
      const updated = repo.findById(held.id)!;
      expect(updated.status).toBe(SnipeStatus.HELD);
      expect(updated.isActive).toBe(false);
    });
  });

  describe('attempts', () => {
    it('incrementAttempts and hasReachedMaxAttempts (0 = unlimited)', () => {
      const snipe = repo.create(userId, createMockSiteSnipeInput({ maxAttempts: 2 }));

      expect(repo.hasReachedMaxAttempts(snipe.id)).toBe(false);
      repo.incrementAttempts(snipe.id);
      repo.incrementAttempts(snipe.id);
      expect(repo.hasReachedMaxAttempts(snipe.id)).toBe(true);
    });

    it('unlimited attempts never reached when maxAttempts = 0', () => {
      const snipe = repo.create(userId, createMockSiteSnipeInput({ maxAttempts: 0 }));
      for (let i = 0; i < 10; i++) repo.incrementAttempts(snipe.id);
      expect(repo.hasReachedMaxAttempts(snipe.id)).toBe(false);
    });
  });

  describe('update', () => {
    it('updates editable fields', () => {
      const snipe = repo.create(userId, createMockSiteSnipeInput());
      const updated = repo.update(snipe.id, {
        name: 'Renamed',
        pollIntervalMs: 2500,
        targetSiteIds: ['200'],
      });

      expect(updated.name).toBe('Renamed');
      expect(updated.pollIntervalMs).toBe(2500);
      expect(updated.targetSiteIds).toEqual(['200']);
    });
  });
});
