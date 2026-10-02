/**
 * Schema fixture loader tests.
 *
 * The SQL dumps in tests/fixtures/db/ stand in for real user databases: v5 is what the
 * released v1.2.0 ships, v6 is what a pre-P2 dev build leaves behind. These tests check the
 * dumps replay faithfully, including the broken v6 foreign key, before any migration runs.
 */

import Database from 'better-sqlite3';
import { loadFixture, disposeFixture } from '@tests/utils/database-helper';
import {
  FIXTURE_MACHINE_ID,
  FIXTURE_SMTP_PASSWORD,
  FIXTURE_USER_PASSWORD,
  V5_ROW_COUNTS,
  V6_ROW_COUNTS,
} from '@tests/fixtures/db/constants';
import { UserRepository } from '@main/database/repositories/UserRepository';
import { NotificationProviderRepository } from '@main/database/repositories/notification-provider.repository';
import { AuthService } from '@main/services/auth/AuthService';
import { NotificationChannel } from '@shared/types';

jest.mock('node-machine-id', () => ({ machineIdSync: () => FIXTURE_MACHINE_ID }));

function rowCounts(db: Database.Database, tables: string[]): Record<string, number> {
  return Object.fromEntries(
    tables.map((t) => [
      t,
      (db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }).n,
    ])
  );
}

function schemaVersion(db: Database.Database): number {
  return (db.prepare('SELECT MAX(version) AS v FROM migrations').get() as { v: number }).v;
}

function fkTargets(db: Database.Database, table: string): string[] {
  return (db.pragma(`foreign_key_list(${table})`) as { table: string }[]).map((fk) => fk.table);
}

describe('schema fixtures', () => {
  let db: Database.Database;

  afterEach(() => disposeFixture(db));

  describe('v5-release-1.2.0', () => {
    beforeEach(() => {
      db = loadFixture('v5-release-1.2.0');
    });

    it('replays at schema version 5 with foreign keys off and the documented rows', () => {
      expect(schemaVersion(db)).toBe(5);
      expect(db.pragma('foreign_keys', { simple: true })).toBe(0);
      expect(rowCounts(db, Object.keys(V5_ROW_COUNTS))).toEqual(V5_ROW_COUNTS);
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE name = 'site_snipes'").get()
      ).toBeUndefined();
    });

    it('is internally consistent: delivery logs reference notifications', () => {
      expect(fkTargets(db, 'notification_delivery_logs')).toEqual(['notifications']);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    });

    it('stores the user password with the legacy scheme and fixture machine id', async () => {
      const auth = new AuthService(new UserRepository(db));
      await expect(auth.getCredentials()).resolves.toEqual({
        email: 'fixture.user@example.com',
        password: FIXTURE_USER_PASSWORD,
      });
    });

    it('stores the SMTP notifier config with the legacy scheme and fixture machine id', () => {
      const notifier = new NotificationProviderRepository(db).findByChannel(
        NotificationChannel.EMAIL_SMTP
      );
      expect(notifier?.enabled).toBe(true);
      expect(notifier?.config).toMatchObject({
        host: 'smtp.gmail.com',
        auth: { user: 'fixture.user@example.com', pass: FIXTURE_SMTP_PASSWORD },
      });
    });
  });

  describe('v6-branch', () => {
    beforeEach(() => {
      db = loadFixture('v6-branch');
    });

    it('replays at schema version 6 with the documented rows', () => {
      expect(schemaVersion(db)).toBe(6);
      expect(rowCounts(db, Object.keys(V6_ROW_COUNTS))).toEqual(V6_ROW_COUNTS);
    });

    it('reproduces the v6 bug: the delivery-log FK targets the dropped notifications_old', () => {
      expect(fkTargets(db, 'notification_delivery_logs')).toEqual(['notifications_old']);
      expect(
        db.prepare("SELECT name FROM sqlite_master WHERE name = 'notifications_old'").get()
      ).toBeUndefined();
    });

    it('keeps the SMTP notifier config ciphertext from v5 unchanged', () => {
      const v5 = loadFixture('v5-release-1.2.0');
      try {
        const config = (d: Database.Database) =>
          (d.prepare('SELECT config FROM notification_providers').get() as { config: string })
            .config;
        expect(config(db)).toBe(config(v5));
        expect(config(db)).toMatch(/^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/);
      } finally {
        disposeFixture(v5);
      }
    });
  });
});
