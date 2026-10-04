/**
 * The upgrade path from a v1.x install, end to end: the first-run copy
 * (`migrateLegacyInstall`), then the app's own startup on the copy (`openDatabase` runs the
 * v6/v7/v8 migrations; `createContainer` migrates the legacy secrets into the vault).
 *
 * - From the v5 fixture (the released v1.2.0) and the v6 fixture: the copy reaches schema
 *   v8 with every watch, snipe, booking, notification, notifier and setting, every watch,
 *   snipe and booking on `provider_id = 'parkstay'`, the encrypted columns byte-identical
 *   and no foreign-key violation. The legacy database and `gmail-oauth.json` keep their
 *   sha256 and no legacy file is deleted.
 * - A transaction committed only in the legacy `-wal` (never checkpointed) reaches
 *   `wa-stay.db`, from the legacy folder and from the installer's snapshot (§12.12).
 * - First start: the copied v1.2.0 secrets (ParkStay password, SMTP config, Gmail file)
 *   become vault envelopes in the WA Stay data folder, while the legacy folder keeps the
 *   pre-vault originals as the backup.
 * - Exactly one "Your data has moved to WA Stay" notice after the copy, none on later starts.
 *   A start that crashes after the copy, before the follow-ups, leaves them to the next one.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { closeDatabase, LATEST_SCHEMA_VERSION, openDatabase } from '@main/database/connection';
import { createContainer } from '@main/app/container';
import { createLocalProfile } from '@main/app/profile';
import {
  NotificationRepository,
  NotifierRepository,
  SettingsRepository,
  UserRepository,
} from '@main/database/repositories';
import {
  finishLegacyInstall,
  migrateLegacyInstall,
  WELCOME_NOTICE_TITLE,
} from '@main/migration/legacy-install';
import { parseGmailSecretFile } from '@main/security/gmail-secret-file';
import { NotifierChannel } from '@shared/types';
import {
  FIXTURE_MACHINE_ID,
  FIXTURE_SMTP_PASSWORD,
  FIXTURE_USER_PASSWORD,
  type FixtureName,
} from '@tests/fixtures/db/constants';
import { FakeSafeStorage } from '@tests/utils/fake-safe-storage';
import { LEGACY_GMAIL_TOKENS, writeLegacyGmailStore } from '@tests/utils/legacy-gmail-store';
import {
  expectUnchanged,
  fingerprint,
  recordedDeps,
  removeTempInstall,
  sha256,
  tempInstall,
  WAL_ONLY_WATCH,
  watchNamesWithoutWal,
  writeLegacyDatabase,
  writeLegacyDatabaseWithWalRow,
  type TempInstall,
} from '@tests/utils/legacy-install';

jest.mock('node-machine-id', () => ({ machineIdSync: () => FIXTURE_MACHINE_ID }));
jest.mock('electron', () => jest.requireActual('@tests/utils/electron-mocks').electron());
jest.mock('electron-updater', () =>
  jest.requireActual('@tests/utils/electron-mocks').electronUpdater()
);

type Row = Record<string, unknown>;

const FIXTURES: Array<[FixtureName, number]> = [
  ['v5-release-1.2.0', 5],
  ['v6-branch', 6],
];

/** Each table's rows in the legacy database, and the v8 table it lives in after the upgrade. */
const KEPT_TABLES: Array<[legacy: string, v8: string]> = [
  ['watches', 'watches'],
  ['site_snipes', 'site_snipes'],
  ['bookings', 'bookings'],
  ['notifications', 'notifications'],
  ['notification_providers', 'notifiers'],
  ['settings', 'settings'],
];

let install: TempInstall;

beforeEach(() => {
  install = tempInstall();
});

afterEach(() => {
  removeTempInstall(install);
});

function withDatabase<T>(file: string, read: (db: Database.Database) => T): T {
  const db = new Database(file, { fileMustExist: true });
  try {
    return read(db);
  } finally {
    db.close();
  }
}

function hasTable(db: Database.Database, table: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
}

function count(db: Database.Database, table: string): number {
  if (!hasTable(db, table)) return 0;
  return (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n;
}

function all(db: Database.Database, sql: string): Row[] {
  return db.prepare(sql).all() as Row[];
}

const SECRET_SQL = {
  users:
    'SELECT id, encrypted_password, encryption_key, encryption_iv, encryption_auth_tag FROM users ORDER BY id',
  legacyNotifiers: 'SELECT id, config FROM notification_providers ORDER BY id',
  notifiers: 'SELECT id, config FROM notifiers ORDER BY id',
};

describe.each(FIXTURES)('upgrading a %s install', (fixture, sourceVersion) => {
  it('reaches v8 with every row, provider ids, byte-identical secrets and no foreign-key violation', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, fixture);
    const gmail = writeLegacyGmailStore(install.paths.legacyUserData);
    const legacyDbHash = sha256(install.paths.legacyDbPath);
    const legacyGmailHash = sha256(gmail);
    const before = fingerprint(install.paths.legacyUserData);
    const legacy = withDatabase(install.paths.legacyDbPath, (db) => ({
      counts: KEPT_TABLES.map(([table]) => count(db, table)),
      users: all(db, SECRET_SQL.users),
      notifiers: all(db, SECRET_SQL.legacyNotifiers),
    }));

    await expect(migrateLegacyInstall(install.paths, recordedDeps())).resolves.toMatchObject({
      outcome: 'migrated',
      sourceSchemaVersion: sourceVersion,
    });
    // The app's startup: open (and migrate) the copy
    const db = openDatabase(install.paths.dbPath);
    try {
      expect(LATEST_SCHEMA_VERSION).toBe(8);
      expect(
        (db.prepare('SELECT MAX(version) AS v FROM migrations').get() as { v: number }).v
      ).toBe(8);
      expect(KEPT_TABLES.map(([, table]) => count(db, table))).toEqual(legacy.counts);
      expect(legacy.counts[0]).toBeGreaterThan(0); // not vacuous
      for (const table of ['watches', 'site_snipes', 'bookings']) {
        expect(all(db, `SELECT DISTINCT provider_id FROM ${table}`)).toEqual(
          count(db, table) > 0 ? [{ provider_id: 'parkstay' }] : []
        );
      }
      expect(all(db, SECRET_SQL.users)).toEqual(legacy.users);
      expect(all(db, SECRET_SQL.notifiers)).toEqual(legacy.notifiers);
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally {
      closeDatabase(db);
    }

    // The legacy folder: same bytes, nothing deleted (SQLite sidecars may appear)
    expect(sha256(install.paths.legacyDbPath)).toBe(legacyDbHash);
    expect(sha256(gmail)).toBe(legacyGmailHash);
    expectUnchanged(install.paths.legacyUserData, before);
    // gmail-oauth.json copied byte for byte
    expect(sha256(path.join(install.paths.userData, 'gmail-oauth.json'))).toBe(legacyGmailHash);
  });
});

describe.each<['legacy' | 'snapshot']>([['legacy'], ['snapshot']])(
  'a transaction only in the %s -wal file (never checkpointed)',
  (kind) => {
    it('is in wa-stay.db, and the source files keep their bytes', async () => {
      const dir = kind === 'legacy' ? install.paths.legacyUserData : install.paths.snapshotDir;
      const source = writeLegacyDatabaseWithWalRow(dir, 'v5-release-1.2.0');
      // Not vacuous: the row is not in the database file itself
      expect(watchNamesWithoutWal(source)).not.toContain(WAL_ONLY_WATCH);
      const dbHash = sha256(source);
      const walHash = sha256(`${source}-wal`);

      await expect(migrateLegacyInstall(install.paths, recordedDeps())).resolves.toMatchObject({
        outcome: 'migrated',
        sourceKind: kind,
      });

      const db = openDatabase(install.paths.dbPath);
      try {
        expect(
          db
            .prepare('SELECT location_name, provider_id FROM watches WHERE name = ?')
            .all(WAL_ONLY_WATCH)
        ).toEqual([{ location_name: expect.any(String), provider_id: 'parkstay' }]);
        expect(count(db, 'watches')).toBe(3);
      } finally {
        closeDatabase(db);
      }
      // Read-only: the WAL was read into the copy, never checkpointed into the source
      expect(sha256(source)).toBe(dbHash);
      expect(sha256(`${source}-wal`)).toBe(walHash);
    });
  }
);

describe('the first start after the copy', () => {
  it('migrates the copied v1.2.0 secrets into the vault; the legacy folder keeps the pre-vault originals', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    const legacyGmail = writeLegacyGmailStore(install.paths.legacyUserData);
    const before = fingerprint(install.paths.legacyUserData);

    // The startup order of src/main/index.ts: migration, database, container
    await migrateLegacyInstall(install.paths, recordedDeps());
    const container = createContainer({
      db: openDatabase(install.paths.dbPath),
      logsDir: path.join(install.paths.userData, 'logs'),
      userDataDir: install.paths.userData,
      safeStorage: new FakeSafeStorage(),
      isReady: () => true,
    });
    try {
      const { db, vault } = container;
      await expect(container.authService.getCredentials()).resolves.toEqual({
        email: 'fixture.user@example.com',
        password: FIXTURE_USER_PASSWORD,
      });
      expect(
        (db.prepare('SELECT encrypted_password FROM users WHERE id = 1').get() as Row)
          .encrypted_password
      ).toMatch(/^vault:v1:os:/);
      const notifier = new NotifierRepository(db, vault).findByChannel(NotifierChannel.EMAIL_SMTP);
      expect(notifier).toMatchObject({ secretState: 'ok' });
      expect(notifier?.config).toMatchObject({ auth: { pass: FIXTURE_SMTP_PASSWORD } });
      expect(container.gmailService.getAuthStatus()).toMatchObject({
        isAuthorized: true,
        expiryDate: LEGACY_GMAIL_TOKENS.expiry_date,
      });
      // The data folder's Gmail file is now format 2
      const copied = fs.readFileSync(path.join(install.paths.userData, 'gmail-oauth.json'));
      expect(parseGmailSecretFile(copied)).toMatchObject({ format: 2 });
    } finally {
      await container.dispose();
    }

    // The backup of the pre-vault secrets: untouched
    expectUnchanged(install.paths.legacyUserData, before);
    expect(parseGmailSecretFile(fs.readFileSync(legacyGmail))).toBeNull();
  });

  const replaceLoginItems = jest.fn();

  /**
   * One start: migration, database, local profile, the migration's follow-ups. `crash`
   * stops it where `openDatabase`/`createContainer` could fail, after the copy.
   */
  const start = async ({ crash = false } = {}) => {
    const result = await migrateLegacyInstall(install.paths, recordedDeps());
    if (crash) return null;
    const db = openDatabase(install.paths.dbPath);
    try {
      const profile = createLocalProfile(new UserRepository(db));
      profile.ensureLocalProfile();
      finishLegacyInstall(result, {
        notifications: new NotificationRepository(db),
        userId: profile.requireUserId(),
        launchOnStartup: new SettingsRepository(db).getValue<boolean>('launchOnStartup') === true,
        replaceLoginItems,
        markerPath: install.paths.markerPath,
        logger: { warn: jest.fn() },
      });
      return db
        .prepare('SELECT type, title, message FROM notifications WHERE title = ?')
        .all(WELCOME_NOTICE_TITLE);
    } finally {
      closeDatabase(db);
    }
  };

  beforeEach(() => replaceLoginItems.mockReset());

  it('adds exactly one welcome notice after the copy, and none on later starts', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');

    const first = await start();
    expect(first).toEqual([
      {
        type: 'info',
        title: 'Your data has moved to WA Stay',
        message: expect.stringContaining(install.paths.legacyUserData),
      },
    ]);
    // v1.2.0's setting (launchOnStartup = true) is re-registered under the new identity
    expect(replaceLoginItems).toHaveBeenCalledTimes(1);
    expect(replaceLoginItems).toHaveBeenCalledWith(true);

    expect(await start()).toHaveLength(1);
    expect(await start()).toHaveLength(1);
    expect(replaceLoginItems).toHaveBeenCalledTimes(1);
  });

  it('a start that crashes after the copy: the next start adds the notice and replaces the login items, once', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');

    expect(await start({ crash: true })).toBeNull();
    expect(replaceLoginItems).not.toHaveBeenCalled();

    expect(await start()).toEqual([
      expect.objectContaining({
        title: WELCOME_NOTICE_TITLE,
        message: expect.stringContaining(install.paths.legacyUserData),
      }),
    ]);
    expect(replaceLoginItems).toHaveBeenCalledTimes(1);
    expect(replaceLoginItems).toHaveBeenCalledWith(true);

    expect(await start()).toHaveLength(1);
    expect(replaceLoginItems).toHaveBeenCalledTimes(1);
  });
});
