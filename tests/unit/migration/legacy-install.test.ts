/**
 * @jest-environment node
 *
 * `migrateLegacyInstall`: the first-run copy of a v1.x install into the WA Stay data folder.
 * Every test runs in its own `fs.mkdtempSync` appData with real better-sqlite3 databases made
 * from the schema fixtures; faults are injected through `deps` (fs, openDatabase, prompt).
 *
 * Each outcome is checked with its marker: fresh install, legacy v5 and v6, snapshot only,
 * already complete / declined / skipped, target exists, a stale `in-progress` copy, a locked
 * source (retried, then asked), a corrupt source (Start fresh), ENOSPC, a source SQLite
 * cannot open in place, and a schema newer than this build. The legacy folder and the
 * snapshot are never changed. `finishLegacyInstall` and the production prompt are below.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import {
  dialogPrompt,
  finishLegacyInstall,
  LOCK_RETRY_DELAYS_MS,
  migrateLegacyInstall,
  SOURCE_OPEN_OPTIONS,
  WELCOME_NOTICE_TITLE,
  type LegacyInstallDeps,
  type MigrationFs,
} from '@main/migration/legacy-install';
import { NotificationType } from '@shared/types/common.types';
import type { FixtureName } from '@tests/fixtures/db/constants';
import {
  expectUnchanged,
  fingerprint,
  readMarker,
  recordedDeps,
  removeTempInstall,
  sha256,
  tempInstall,
  WAL_ONLY_WATCH,
  writeLegacyDatabase,
  writeLegacyDatabaseWithWalRow,
  type RecordedDeps,
  type TempInstall,
} from '@tests/utils/legacy-install';

let install: TempInstall;

beforeEach(() => {
  install = tempInstall();
});

afterEach(() => {
  removeTempInstall(install);
});

const ISO_DATE = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

function legacyDir(): string {
  return install.paths.legacyUserData;
}

function gmailIn(dir: string): string {
  return path.join(dir, 'gmail-oauth.json');
}

function writeGmail(dir: string, content = '{"encrypted":"legacy-gmail-store"}'): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(gmailIn(dir), content);
}

/** The data folder's file names, apart from the marker. */
function dataFolderFiles(): string[] {
  if (!fs.existsSync(install.paths.userData)) return [];
  return fs
    .readdirSync(install.paths.userData)
    .filter((name) => name !== 'migration.json')
    .sort();
}

/** Runs one query. Read-write, so closing removes the WAL sidecars it creates. */
function query<T>(file: string, sql: string): T {
  const db = new Database(file, { fileMustExist: true });
  try {
    return db.prepare(sql).get() as T;
  } finally {
    db.close();
  }
}

function schemaVersionOf(file: string): number {
  return query<{ v: number }>(file, 'SELECT MAX(version) AS v FROM migrations').v;
}

function watchCount(file: string): number {
  return query<{ n: number }>(file, 'SELECT COUNT(*) AS n FROM watches').n;
}

function fsWith(overrides: Partial<MigrationFs>): MigrationFs {
  return { ...fs, ...overrides } as MigrationFs;
}

function errorWithCode(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

describe('migrateLegacyInstall', () => {
  it('fresh install: no legacy folder and no snapshot, so nothing is written (no marker)', async () => {
    const deps = recordedDeps();

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toEqual({
      outcome: 'fresh-install',
    });

    expect(fs.existsSync(install.paths.markerPath)).toBe(false);
    expect(fs.existsSync(install.paths.dbPath)).toBe(false);
    expect(deps.prompts).toEqual([]);
    expect(deps.lines).toContain(
      'info: legacy-install: no legacy data found; outcome fresh-install'
    );
  });

  it.each<[FixtureName, number]>([
    ['v5-release-1.2.0', 5],
    ['v6-branch', 6],
  ])(
    'legacy %s: copies the database to wa-stay.db and writes the complete marker',
    async (fixture, version) => {
      writeLegacyDatabase(install.paths.legacyDbPath, fixture);
      const before = fingerprint(legacyDir());
      const deps = recordedDeps();

      await expect(migrateLegacyInstall(install.paths, deps)).resolves.toEqual({
        outcome: 'migrated',
        sourceDir: legacyDir(),
        sourceKind: 'legacy',
        sourceSchemaVersion: version,
      });

      // A checked copy at the source's version; the app's migrations run when it is opened
      expect(dataFolderFiles()).toEqual(['wa-stay.db']);
      expect(
        query<{ integrity_check: string }>(install.paths.dbPath, 'PRAGMA integrity_check')
          .integrity_check
      ).toBe('ok');
      expect(schemaVersionOf(install.paths.dbPath)).toBe(version);
      expect(watchCount(install.paths.dbPath)).toBe(2);
      expect(readMarker(install)).toEqual({
        version: 1,
        status: 'complete',
        appVersion: '2.0.0-test',
        source: legacyDir(),
        sourceKind: 'legacy',
        startedAt: ISO_DATE,
        sourceSchemaVersion: version,
        migratedAt: ISO_DATE,
        copied: ['parkstay.db'],
      });
      expectUnchanged(legacyDir(), before);
      expect(deps.prompts).toEqual([]);

      const summary = deps.lines.find((line) => line.includes('outcome migrated'));
      expect(summary).toMatch(
        new RegExp(
          `^info: legacy-install: outcome migrated from legacy .*: schema v${version}, \\d+ bytes, \\d+ ms \\(parkstay\\.db\\)$`
        )
      );
      // Logs name paths and sizes, never row data
      for (const line of deps.lines) {
        expect(line).not.toContain('fixture.user@example.com');
        expect(line).not.toContain('FIXTURESESSIONKEY');
      }
    }
  );

  it('opens the source read-only, never creating it, with a 5 s lock timeout', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    const opened: Array<[string, Database.Options | undefined]> = [];
    const deps = recordedDeps([], {
      openDatabase: (file, options) => {
        opened.push([file, options]);
        return new Database(file, options);
      },
    });

    await migrateLegacyInstall(install.paths, deps);

    expect(SOURCE_OPEN_OPTIONS).toEqual({ readonly: true, fileMustExist: true, timeout: 5000 });
    expect(opened[0]).toEqual([install.paths.legacyDbPath, SOURCE_OPEN_OPTIONS]);
    // Then the copy, which is checked before the rename
    expect(opened[1]).toEqual([`${install.paths.dbPath}.migrating`, { fileMustExist: true }]);
  });

  it('snapshot only (the v1 uninstaller deleted the legacy folder): copies from legacy-snapshot and keeps it', async () => {
    const snapshotDb = path.join(install.paths.snapshotDir, 'parkstay.db');
    writeLegacyDatabase(snapshotDb, 'v5-release-1.2.0');
    writeGmail(install.paths.snapshotDir);
    const before = fingerprint(install.paths.snapshotDir);
    const deps = recordedDeps();

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toEqual({
      outcome: 'migrated',
      sourceDir: install.paths.snapshotDir,
      sourceKind: 'snapshot',
      sourceSchemaVersion: 5,
    });

    expect(dataFolderFiles()).toEqual(['gmail-oauth.json', 'legacy-snapshot', 'wa-stay.db']);
    expect(readMarker(install)).toMatchObject({
      status: 'complete',
      source: install.paths.snapshotDir,
      sourceKind: 'snapshot',
      copied: ['parkstay.db', 'gmail-oauth.json'],
    });
    // The snapshot is the backup of the pre-vault secrets: never deleted or changed
    expectUnchanged(install.paths.snapshotDir, before);
  });

  it('both the legacy folder and a snapshot: prefers the live legacy folder', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v6-branch');
    writeLegacyDatabase(path.join(install.paths.snapshotDir, 'parkstay.db'), 'v5-release-1.2.0');
    const deps = recordedDeps();

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'migrated',
      sourceKind: 'legacy',
      sourceSchemaVersion: 6,
    });
    expect(fs.existsSync(path.join(install.paths.snapshotDir, 'parkstay.db'))).toBe(true);
  });

  it.each(['complete', 'declined', 'skipped'])(
    'marker %s is final: nothing is copied or changed on a later start',
    async (status) => {
      writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
      fs.mkdirSync(install.paths.userData, { recursive: true });
      const marker = `${JSON.stringify({ version: 1, status, appVersion: '2.0.0' })}\n`;
      fs.writeFileSync(install.paths.markerPath, marker);
      const deps = recordedDeps();

      await expect(migrateLegacyInstall(install.paths, deps)).resolves.toEqual({
        outcome: 'already-done',
      });

      expect(fs.existsSync(install.paths.dbPath)).toBe(false);
      expect(fs.readFileSync(install.paths.markerPath, 'utf8')).toBe(marker);
      expect(deps.prompts).toEqual([]);
      expect(deps.lines).toEqual([
        `info: legacy-install: already done (${status}); outcome already-done`,
      ]);
    }
  );

  it('a second start after a copy is already-done and leaves wa-stay.db alone', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    await migrateLegacyInstall(install.paths, recordedDeps());
    const copy = sha256(install.paths.dbPath);
    const marker = fs.readFileSync(install.paths.markerPath, 'utf8');
    // The legacy data changes afterwards (v1.x still installed): it is not copied again
    fs.rmSync(install.paths.legacyDbPath);
    writeLegacyDatabase(install.paths.legacyDbPath, 'v6-branch');

    await expect(migrateLegacyInstall(install.paths, recordedDeps())).resolves.toEqual({
      outcome: 'already-done',
    });
    expect(sha256(install.paths.dbPath)).toBe(copy);
    expect(fs.readFileSync(install.paths.markerPath, 'utf8')).toBe(marker);
  });

  it('target exists (both present, e.g. a dev build): never overwrites wa-stay.db, marks skipped and logs both paths', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    writeLegacyDatabase(install.paths.dbPath, 'v6-branch');
    const existing = sha256(install.paths.dbPath);
    const deps = recordedDeps();

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toEqual({
      outcome: 'target-exists',
      sourceDir: legacyDir(),
      sourceKind: 'legacy',
    });

    expect(sha256(install.paths.dbPath)).toBe(existing);
    expect(readMarker(install)).toEqual({
      version: 1,
      status: 'skipped',
      appVersion: '2.0.0-test',
      source: legacyDir(),
      sourceKind: 'legacy',
      reason: 'target-exists',
      target: install.paths.dbPath,
      skippedAt: ISO_DATE,
    });
    const warning = deps.lines.find((line) => line.startsWith('warn:')) ?? '';
    expect(warning).toContain(install.paths.dbPath);
    expect(warning).toContain(install.paths.legacyDbPath);
    // Final: the next start does nothing
    await expect(migrateLegacyInstall(install.paths, recordedDeps())).resolves.toEqual({
      outcome: 'already-done',
    });
  });

  it('stale in-progress (killed mid-copy): the .migrating files are cleaned up and the copy is redone', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    fs.mkdirSync(install.paths.userData, { recursive: true });
    fs.writeFileSync(
      install.paths.markerPath,
      JSON.stringify({ version: 1, status: 'in-progress', appVersion: '2.0.0' })
    );
    // What a killed copy leaves: a half-written temp copy and its journal, and (killed
    // between the rename and the marker) our own earlier copy in place
    fs.writeFileSync(`${install.paths.dbPath}.migrating`, 'half a database');
    fs.writeFileSync(`${install.paths.dbPath}.migrating-journal`, 'journal');
    fs.writeFileSync(install.paths.dbPath, 'an earlier, unfinished copy');
    const deps = recordedDeps();

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'migrated',
      sourceSchemaVersion: 5,
    });

    expect(dataFolderFiles()).toEqual(['wa-stay.db']);
    expect(watchCount(install.paths.dbPath)).toBe(2);
    expect(readMarker(install)).toMatchObject({ status: 'complete' });
    expect(deps.lines).toContain(
      'warn: legacy-install: a previous copy did not finish; copying again'
    );
  });

  describe('a locked source', () => {
    /** Holds an exclusive lock on the legacy database (as a busy v1.x app would). */
    function lockLegacyDatabase(): Database.Database {
      const holder = new Database(install.paths.legacyDbPath);
      holder.pragma('locking_mode = EXCLUSIVE');
      holder.exec('BEGIN EXCLUSIVE');
      holder.exec(
        "INSERT INTO settings (key, value, value_type, category) VALUES ('held', '1', 'number', 'general')"
      );
      return holder;
    }

    /** The real openDatabase, with a short lock timeout so the test does not wait 5 s. */
    function quickTimeout(
      opened: Array<Database.Options | undefined>
    ): LegacyInstallDeps['openDatabase'] {
      return (file, options) => {
        opened.push(options);
        return new Database(file, options?.timeout ? { ...options, timeout: 20 } : options);
      };
    }

    it('retries with backoff and succeeds once the lock is released', async () => {
      writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
      const holder = lockLegacyDatabase();
      const opened: Array<Database.Options | undefined> = [];
      const deps: RecordedDeps = recordedDeps([], {
        openDatabase: quickTimeout(opened),
        sleep: async (ms) => {
          deps.sleeps.push(ms);
          if (holder.open) {
            holder.exec('COMMIT');
            holder.close();
          }
        },
      });

      try {
        await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
          outcome: 'migrated',
        });
      } finally {
        if (holder.open) holder.close();
      }

      expect(deps.sleeps).toEqual([LOCK_RETRY_DELAYS_MS[0]]);
      expect(opened[0]).toEqual(SOURCE_OPEN_OPTIONS);
      expect(deps.prompts).toEqual([]);
      expect(deps.lines.join('\n')).toMatch(
        /warn: legacy-install: the legacy database is locked \(SQLITE_BUSY .*\); retry 1 of 3 in 500 ms/
      );
      // The copy holds what the holder committed before releasing it
      expect(
        query<{ n: number }>(
          install.paths.dbPath,
          "SELECT COUNT(*) AS n FROM settings WHERE key = 'held'"
        ).n
      ).toBe(1);
      expect(readMarker(install)).toMatchObject({ status: 'complete' });
    });

    it('still locked after three retries: asks the user; Quit leaves a failed marker and nothing copied', async () => {
      writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
      const holder = lockLegacyDatabase();
      const deps = recordedDeps(['quit'], { openDatabase: quickTimeout([]) });

      try {
        await expect(migrateLegacyInstall(install.paths, deps)).resolves.toEqual({
          outcome: 'quit',
          sourceDir: legacyDir(),
          sourceKind: 'legacy',
        });
      } finally {
        holder.exec('ROLLBACK');
        holder.close();
      }

      expect(deps.sleeps).toEqual([...LOCK_RETRY_DELAYS_MS]);
      expect(deps.prompts).toEqual([
        { reason: 'locked', message: expect.stringContaining('in use'), keptDir: legacyDir() },
      ]);
      expect(readMarker(install)).toMatchObject({
        status: 'failed',
        reason: 'locked',
        error: expect.stringContaining('SQLITE_BUSY'),
        failedAt: ISO_DATE,
      });
      expect(dataFolderFiles()).toEqual([]);
      // Quit is not final: the next start tries again
      await expect(migrateLegacyInstall(install.paths, recordedDeps())).resolves.toMatchObject({
        outcome: 'migrated',
      });
    });

    it('a backup that stays locked mid-copy gives up as locked instead of spinning', async () => {
      writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
      let backups = 0;
      const deps = recordedDeps(['quit'], {
        openDatabase: (file, options) => {
          const db = new Database(file, options);
          if (file !== install.paths.legacyDbPath) return db;
          // better-sqlite3 keeps stepping a busy backup; each step reports the same pages left
          db.backup = async (_target, backupOptions) => {
            backups += 1;
            for (let step = 0; step < 100; step += 1) {
              backupOptions?.progress({ totalPages: 40, remainingPages: 40 });
            }
            throw new Error('the stalled backup was not stopped');
          };
          return db;
        },
      });

      await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
        outcome: 'quit',
      });
      expect(backups).toBe(1 + LOCK_RETRY_DELAYS_MS.length);
      expect(deps.prompts).toMatchObject([{ reason: 'locked' }]);
    });
  });

  it.each<[string, () => void]>([
    [
      'not a database (SQLITE_NOTADB)',
      () => {
        fs.mkdirSync(legacyDir(), { recursive: true });
        fs.writeFileSync(install.paths.legacyDbPath, Buffer.alloc(8192, 7));
      },
    ],
    [
      'a damaged page (quick_check fails)',
      () => {
        writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
        const db = new Database(install.paths.legacyDbPath);
        db.pragma('journal_mode = DELETE');
        db.exec('CREATE TABLE padding (x TEXT)');
        const insert = db.prepare('INSERT INTO padding VALUES (?)');
        for (let i = 0; i < 300; i += 1) insert.run('x'.repeat(400));
        db.close();
        const bytes = fs.readFileSync(install.paths.legacyDbPath);
        const pageSize = bytes.readUInt16BE(16);
        bytes.fill(
          0xff,
          pageSize * (Math.floor(bytes.length / pageSize) - 3),
          bytes.length - pageSize * 2
        );
        fs.writeFileSync(install.paths.legacyDbPath, bytes);
      },
    ],
  ])(
    'corrupt source, %s: asks the user; Start fresh marks declined and keeps the legacy folder',
    async (_case, makeCorrupt) => {
      makeCorrupt();
      writeGmail(legacyDir());
      const before = fingerprint(legacyDir());
      const deps = recordedDeps(['start-fresh']);

      await expect(migrateLegacyInstall(install.paths, deps)).resolves.toEqual({
        outcome: 'declined',
        sourceDir: legacyDir(),
        sourceKind: 'legacy',
      });

      expect(deps.prompts).toEqual([
        { reason: 'corrupt', message: expect.stringContaining('damaged'), keptDir: legacyDir() },
      ]);
      expect(readMarker(install)).toMatchObject({
        status: 'declined',
        reason: 'corrupt',
        source: legacyDir(),
        declinedAt: ISO_DATE,
      });
      // No partial copy, no stray files, and the legacy folder is untouched
      expect(dataFolderFiles()).toEqual([]);
      expectUnchanged(legacyDir(), before);
      // Declined is final
      await expect(migrateLegacyInstall(install.paths, recordedDeps())).resolves.toEqual({
        outcome: 'already-done',
      });
    }
  );

  it('a copy that fails integrity_check counts as corrupt and is deleted', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    const deps = recordedDeps(['quit'], {
      openDatabase: (file, options) => {
        const db = new Database(file, options);
        if (!file.endsWith('.migrating')) return db;
        const realPragma = db.pragma.bind(db);
        db.pragma = ((source: string, pragmaOptions?: Database.PragmaOptions) =>
          source === 'integrity_check'
            ? 'row 3 missing from index idx_watches_user_id'
            : realPragma(source, pragmaOptions)) as Database.Database['pragma'];
        return db;
      },
    });

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'quit',
    });
    expect(deps.prompts).toMatchObject([{ reason: 'corrupt' }]);
    expect(readMarker(install)).toMatchObject({
      status: 'failed',
      reason: 'corrupt',
      error: 'integrity_check: row 3 missing from index idx_watches_user_id',
    });
    expect(dataFolderFiles()).toEqual([]);
  });

  it('out of disk space (ENOSPC, injected fs): removes the partial copy, records failed, asks; Retry then succeeds', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    writeGmail(legacyDir());
    let failures = 1;
    const atPrompt: string[][] = [];
    const deps: RecordedDeps = recordedDeps([], {
      // The Gmail copy runs after the database is in place, so a failure there must undo it
      fs: fsWith({
        copyFileSync: (from, to, mode) => {
          if (failures > 0) {
            failures -= 1;
            throw errorWithCode('ENOSPC', 'ENOSPC: no space left on device, copyfile');
          }
          return fs.copyFileSync(from, to, mode);
        },
      }),
      prompt: async (request) => {
        deps.prompts.push(request);
        atPrompt.push(dataFolderFiles());
        expect(readMarker(install)).toMatchObject({
          status: 'failed',
          reason: 'disk-full',
          error: 'ENOSPC: no space left on device, copyfile',
        });
        return 'retry';
      },
    });

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'migrated',
    });

    expect(deps.prompts).toEqual([
      { reason: 'disk-full', message: expect.stringContaining('disk space'), keptDir: legacyDir() },
    ]);
    expect(atPrompt).toEqual([[]]); // wa-stay.db, gmail-oauth.json and .migrating all undone
    expect(dataFolderFiles()).toEqual(['gmail-oauth.json', 'wa-stay.db']);
    expect(readMarker(install)).toMatchObject({
      status: 'complete',
      copied: ['parkstay.db', 'gmail-oauth.json'],
    });
  });

  it('out of disk space writing the marker: the copy is undone and Quit leaves nothing behind', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    const deps = recordedDeps(['quit'], {
      fs: fsWith({
        writeFileSync: ((file: fs.PathOrFileDescriptor, data: string) => {
          if (typeof data === 'string' && data.includes('"complete"')) {
            throw errorWithCode('ENOSPC', 'ENOSPC: no space left on device, write');
          }
          return fs.writeFileSync(file, data);
        }) as MigrationFs['writeFileSync'],
      }),
    });

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'quit',
    });
    expect(deps.prompts).toMatchObject([{ reason: 'disk-full' }]);
    expect(dataFolderFiles()).toEqual([]);
    expect(readMarker(install)).toMatchObject({ status: 'failed', reason: 'disk-full' });
  });

  it('SQLITE_CANTOPEN in place (read-only folder, -wal without -shm): backs up from a staging copy', async () => {
    writeLegacyDatabaseWithWalRow(legacyDir(), 'v5-release-1.2.0');
    fs.rmSync(`${install.paths.legacyDbPath}-shm`);
    const before = fingerprint(legacyDir());
    const opened: string[] = [];
    const deps = recordedDeps([], {
      openDatabase: (file, options) => {
        opened.push(file);
        if (file === install.paths.legacyDbPath) {
          throw errorWithCode('SQLITE_CANTOPEN', 'unable to open database file');
        }
        return new Database(file, options);
      },
    });

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'migrated',
      sourceDir: legacyDir(),
    });

    const staged = opened[1];
    expect(path.dirname(path.dirname(staged))).toBe(install.paths.userData);
    expect(path.basename(path.dirname(staged))).toMatch(/^\.legacy-staging-/);
    expect(fs.existsSync(path.dirname(staged))).toBe(false); // removed afterwards
    expect(dataFolderFiles()).toEqual(['wa-stay.db']);
    expect(
      query<{ n: number }>(
        install.paths.dbPath,
        `SELECT COUNT(*) AS n FROM watches WHERE name = '${WAL_ONLY_WATCH}'`
      ).n
    ).toBe(1);
    expectUnchanged(legacyDir(), before);
  });

  it('a copy that takes longer than 2 s logs its progress', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    let now = Date.parse('2026-10-04T00:00:00.000Z');
    const deps = recordedDeps([], { clock: () => new Date((now += 2500)) });

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'migrated',
    });
    expect(deps.lines.join('\n')).toMatch(
      /info: legacy-install: copying, \d+ of \d+ pages after \d+ ms/
    );
  });

  it('a legacy schema newer than this build is copied anyway, with a warning', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v6-branch');
    const db = new Database(install.paths.legacyDbPath);
    db.exec('INSERT INTO migrations (version) VALUES (9)');
    db.close();
    const deps = recordedDeps();

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'migrated',
      sourceSchemaVersion: 9,
    });
    expect(deps.lines).toContain(
      'warn: legacy-install: the legacy database is at schema v9, newer than this build (v8); it is copied but cannot be opened by this build'
    );
  });

  it('gmail-oauth.json is copied byte-identical, and the legacy one is untouched', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    writeGmail(legacyDir(), '{"gmail_credentials":"abc","gmail_oauth_tokens":"def"}\n');
    const legacyGmail = sha256(gmailIn(legacyDir()));

    await migrateLegacyInstall(install.paths, recordedDeps());

    expect(sha256(gmailIn(install.paths.userData))).toBe(legacyGmail);
    expect(sha256(gmailIn(legacyDir()))).toBe(legacyGmail);
    expect(readMarker(install)).toMatchObject({ copied: ['parkstay.db', 'gmail-oauth.json'] });
  });

  it('gmail-oauth.json never overwrites one already in the data folder', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    writeGmail(legacyDir(), '{"legacy":true}');
    writeGmail(install.paths.userData, '{"already":"here"}');
    const deps = recordedDeps();

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'migrated',
    });

    expect(fs.readFileSync(gmailIn(install.paths.userData), 'utf8')).toBe('{"already":"here"}');
    expect(readMarker(install)).toMatchObject({ copied: ['parkstay.db'] });
    expect(deps.lines).toContain(
      'warn: legacy-install: gmail-oauth.json already exists in the data folder; kept it'
    );
  });

  it('a damaged marker is treated as absent', async () => {
    writeLegacyDatabase(install.paths.legacyDbPath, 'v5-release-1.2.0');
    fs.mkdirSync(install.paths.userData, { recursive: true });
    fs.writeFileSync(install.paths.markerPath, '{"status": "comp');
    const deps = recordedDeps();

    await expect(migrateLegacyInstall(install.paths, deps)).resolves.toMatchObject({
      outcome: 'migrated',
    });
    expect(deps.lines).toContain(
      `warn: legacy-install: ${install.paths.markerPath} is unreadable; treating it as absent`
    );
  });

  it('the legacy source disabled (test hook without a legacy override): only the snapshot is considered', async () => {
    const deps = recordedDeps();

    await expect(
      migrateLegacyInstall({ ...install.paths, legacyDbPath: null }, deps)
    ).resolves.toEqual({ outcome: 'fresh-install' });
  });
});

describe('finishLegacyInstall', () => {
  function finishDeps() {
    return {
      notifications: { create: jest.fn() },
      userId: 1,
      launchOnStartup: true,
      replaceLoginItems: jest.fn(),
      logger: { warn: jest.fn() },
    };
  }

  it('after a copy in this start: one INFO notice naming the kept folder, and launch at login replaced', () => {
    const deps = finishDeps();

    finishLegacyInstall({ outcome: 'migrated', sourceDir: '/data/parkstay-bookings' }, deps);

    expect(deps.notifications.create).toHaveBeenCalledTimes(1);
    expect(deps.notifications.create).toHaveBeenCalledWith({
      userId: 1,
      type: NotificationType.INFO,
      title: WELCOME_NOTICE_TITLE,
      message: expect.stringContaining('/data/parkstay-bookings'),
    });
    expect(WELCOME_NOTICE_TITLE).toBe('Your data has moved to WA Stay');
    expect(deps.replaceLoginItems).toHaveBeenCalledWith(true);
  });

  it.each(['already-done', 'fresh-install', 'target-exists', 'declined'] as const)(
    'after %s: no notice and no login-item change',
    (outcome) => {
      const deps = finishDeps();

      finishLegacyInstall({ outcome, sourceDir: '/data/old' }, deps);

      expect(deps.notifications.create).not.toHaveBeenCalled();
      expect(deps.replaceLoginItems).not.toHaveBeenCalled();
    }
  );

  it('a failing step is logged and never stops the start', () => {
    const deps = finishDeps();
    deps.notifications.create.mockImplementation(() => {
      throw new Error('database is closed');
    });
    deps.replaceLoginItems.mockImplementation(() => {
      throw new Error('registry denied');
    });

    expect(() =>
      finishLegacyInstall({ outcome: 'migrated', sourceDir: '/data/old' }, deps)
    ).not.toThrow();
    expect(deps.logger.warn).toHaveBeenCalledTimes(2);
  });
});

describe('dialogPrompt (production)', () => {
  it.each<[number, string]>([
    [0, 'retry'],
    [1, 'start-fresh'],
    [2, 'quit'],
    [7, 'quit'],
  ])(
    'button %i means %s; the message names the folder that keeps the data',
    async (response, choice) => {
      const showMessageBox = jest.fn(async () => ({ response }));

      await expect(
        dialogPrompt({ showMessageBox })({
          reason: 'corrupt',
          message: 'The old database is damaged, so it could not be copied.',
          keptDir: 'C:\\Users\\Ann\\AppData\\Roaming\\parkstay-bookings',
        })
      ).resolves.toBe(choice);

      expect(showMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          buttons: ['Retry', 'Start fresh', 'Quit'],
          defaultId: 0,
          cancelId: 2,
          detail: expect.stringContaining('C:\\Users\\Ann\\AppData\\Roaming\\parkstay-bookings'),
        })
      );
      const [[options]] = showMessageBox.mock.calls as unknown as Array<[{ detail: string }]>;
      expect(options.detail).toContain('The old database is damaged');
    }
  );
});
