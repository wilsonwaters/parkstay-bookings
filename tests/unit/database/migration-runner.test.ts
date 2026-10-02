/**
 * Migration runner unit tests: applyMigration's transaction and foreign-key check, the
 * foreign_keys toggling in runMigrations, and the too-new guard.
 */

import Database from 'better-sqlite3';
import {
  applyMigration,
  DatabaseTooNewError,
  LATEST_SCHEMA_VERSION,
  MigrationError,
  runMigrations,
} from '@main/database/connection';
import { logger } from '@main/utils/logger';

function versions(db: Database.Database): number[] {
  return (
    db.prepare('SELECT version FROM migrations ORDER BY version').all() as {
      version: number;
    }[]
  ).map((r) => r.version);
}

function tableNames(db: Database.Database): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((r) => r.name);
}

describe('applyMigration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // runMigrations turns foreign keys off around the steps; do the same here.
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE migrations (version INTEGER PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE parents (id INTEGER PRIMARY KEY);
      CREATE TABLE legacy_children (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents(id));
      INSERT INTO legacy_children VALUES (1, 404);
    `);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db.close();
  });

  it('commits the step and records its version together', () => {
    applyMigration(db, 1, ['things'], () => {
      db.exec('CREATE TABLE things (id INTEGER PRIMARY KEY); INSERT INTO things VALUES (1);');
    });

    expect(versions(db)).toEqual([1]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM things').get()).toEqual({ n: 1 });
  });

  it('rolls the whole step back and throws MigrationError(version, cause) when it fails', () => {
    const cause = new Error('step exploded');
    let thrown: unknown;
    try {
      applyMigration(db, 2, ['things'], () => {
        db.exec('CREATE TABLE things (id INTEGER PRIMARY KEY); INSERT INTO things VALUES (1);');
        throw cause;
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MigrationError);
    expect((thrown as MigrationError).version).toBe(2);
    expect((thrown as MigrationError).cause).toBe(cause);
    expect((thrown as MigrationError).message).toContain('step exploded');
    expect(versions(db)).toEqual([]);
    expect(tableNames(db)).not.toContain('things');
  });

  it('fails on a foreign-key violation in a table it touched, and only warns about others', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    // The pre-existing orphan in legacy_children is not this step's doing: warn, commit.
    applyMigration(db, 3, ['things'], () => {
      db.exec('CREATE TABLE things (id INTEGER PRIMARY KEY)');
    });
    expect(versions(db)).toEqual([3]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('legacy_children -> parents (1)'));

    // An orphan the step writes into a table it owns is fatal, and nothing is kept.
    expect(() =>
      applyMigration(db, 4, ['kids'], () => {
        db.exec(`
          CREATE TABLE kids (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents(id));
          INSERT INTO kids VALUES (1, 999);
        `);
      })
    ).toThrow(
      /Database migration 4 failed: foreign_key_check found 1 violation\(s\): kids -> parents/
    );
    expect(versions(db)).toEqual([3]);
    expect(tableNames(db)).not.toContain('kids');
  });
});

describe('runMigrations', () => {
  afterEach(() => jest.restoreAllMocks());

  it('turns foreign keys off before the first step and back on after the last, outside any transaction', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    const events: string[] = [];
    const pragma = db.pragma.bind(db);
    const prepare = db.prepare.bind(db);
    jest.spyOn(db, 'pragma').mockImplementation(((source: string, options?: unknown) => {
      if (/^foreign_keys\s*=/.test(source)) {
        events.push(`${source.replace(/\s+/g, '')}${db.inTransaction ? ' (in transaction)' : ''}`);
      }
      return pragma(source, options as Database.PragmaOptions);
    }) as typeof db.pragma);
    jest.spyOn(db, 'prepare').mockImplementation(((source: string) => {
      if (source.startsWith('INSERT INTO migrations')) {
        events.push(`record${db.inTransaction ? ' (in transaction)' : ''}`);
      }
      return prepare(source);
    }) as typeof db.prepare);

    runMigrations(db);

    expect(events[0]).toBe('foreign_keys=OFF');
    expect(events[events.length - 1]).toBe('foreign_keys=ON');
    expect(events.slice(1, -1)).toEqual(
      Array.from({ length: LATEST_SCHEMA_VERSION }, () => 'record (in transaction)')
    );
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });

  it('refuses a database newer than this build with DatabaseTooNewError and runs nothing', () => {
    const db = new Database(':memory:');
    runMigrations(db);
    db.prepare('INSERT INTO migrations (version) VALUES (?)').run(LATEST_SCHEMA_VERSION + 1);
    const schemaBefore = db.prepare('SELECT type, name, sql FROM sqlite_master').all();
    const pragma = jest.spyOn(db, 'pragma');

    let thrown: unknown;
    try {
      runMigrations(db);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DatabaseTooNewError);
    expect((thrown as DatabaseTooNewError).version).toBe(LATEST_SCHEMA_VERSION + 1);
    expect((thrown as Error).message).toMatch(/newer than this app supports \(7\)/);
    expect(pragma).not.toHaveBeenCalled();
    expect(db.prepare('SELECT type, name, sql FROM sqlite_master').all()).toEqual(schemaBefore);
    expect(versions(db)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    db.close();
  });
});
