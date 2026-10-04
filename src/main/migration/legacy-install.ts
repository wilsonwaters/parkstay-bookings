/**
 * First-run migration of a v1.x install to WA Stay (architecture-notes §6, §12.12, §12.23).
 *
 * v1.x kept its data in `<appData>/<LEGACY_DATA_FOLDER_NAME>`; WA Stay keeps it in
 * `<appData>/WA Stay` (`app/paths.ts`). On the first start after the upgrade, before the
 * database is opened and before the vault's first use, this copies:
 *
 * - the v1.x database to `wa-stay.db` with SQLite's online backup, from a read-only
 *   connection. That gives a consistent copy even while a v1.x app is still running, and
 *   includes any transactions still in the `-wal` file. The copy then goes through the
 *   normal migrations (`openDatabase`), and P5's `migrateLegacySecrets` re-encrypts its
 *   legacy secrets;
 * - `gmail-oauth.json`, byte for byte, unless the data folder already has one.
 *
 * The source is the live legacy folder when it exists, else the v2 installer's
 * `legacy-snapshot` (taken before the v1 uninstaller could delete the folder), else there
 * is nothing to migrate.
 *
 * **The legacy folder and the snapshot are never deleted or modified.** They are the only
 * backup of the user's data as v1.x left it, including the pre-vault secrets that
 * `migrateLegacySecrets` re-encrypts in the copy. (Opening the source read-only may leave
 * SQLite's empty `-wal`/`-shm` sidecars next to it; the database file is never written.)
 *
 * `migration.json` in the data folder records what happened:
 *
 * | status | meaning | next start |
 * | --- | --- | --- |
 * | `in-progress` | a copy started and did not finish (crash or kill) | copies again |
 * | `complete` | copied | nothing |
 * | `failed` | the copy failed and the user chose Quit | tries again |
 * | `declined` | the copy failed and the user chose "Start fresh" | nothing |
 * | `skipped` | `wa-stay.db` already existed, so nothing was copied over it | nothing |
 *
 * A fresh install writes no marker, so a snapshot the installer takes later is still used.
 * The copy is written to `wa-stay.db.migrating`, checked, then renamed into place, so
 * `wa-stay.db` is either absent or complete. Logs carry paths, sizes, schema versions and
 * error codes, never row data or secrets.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { NotificationInput } from '@shared/types';
import { NotificationType } from '@shared/types/common.types';
import { GMAIL_STORE_FILE_NAME, LEGACY_DATABASE_FILE_NAME, type AppPaths } from '../app/paths';
import { LATEST_SCHEMA_VERSION } from '../database/connection';
import { logger as appLogger } from '../utils/logger';

export type MigrationStatus = 'in-progress' | 'complete' | 'failed' | 'declined' | 'skipped';

/** Statuses after which the migration never runs again. */
const FINAL_STATUSES: readonly MigrationStatus[] = ['complete', 'declined', 'skipped'];

/** Where the data came from: the live legacy folder or the installer's snapshot. */
export type SourceKind = 'legacy' | 'snapshot';

/** Why a copy failed, as shown to the user and recorded in the marker. */
export type FailureKind = 'locked' | 'corrupt' | 'disk-full' | 'unreadable' | 'error';

export interface MigrationMarker {
  version: 1;
  status: MigrationStatus;
  /** The app version that wrote the marker. */
  appVersion: string;
  /** The folder the data is copied from. */
  source?: string;
  sourceKind?: SourceKind;
  startedAt?: string;
  /** `complete`: the source database's schema version (`MAX(version)` of `migrations`). */
  sourceSchemaVersion?: number;
  migratedAt?: string;
  /** `complete`: the source files copied. */
  copied?: string[];
  /** `failed`, `declined`: why the copy failed. `skipped`: `target-exists`. */
  reason?: FailureKind | 'target-exists';
  /** `failed`: the error code or message (never data). */
  error?: string;
  failedAt?: string;
  declinedAt?: string;
  skippedAt?: string;
  /** `skipped`: the database that already existed. */
  target?: string;
}

export type LegacyInstallOutcome =
  /** The marker says it already ran (`complete`, `declined` or `skipped`). */
  | 'already-done'
  /** No legacy data: nothing was written. */
  | 'fresh-install'
  /** `wa-stay.db` already existed: nothing was copied over it. */
  | 'target-exists'
  /** Copied: `wa-stay.db` is ready to open. */
  | 'migrated'
  /** The copy failed and the user chose "Start fresh". */
  | 'declined'
  /** The copy failed and the user chose Quit: start nothing. */
  | 'quit';

export interface LegacyInstallResult {
  outcome: LegacyInstallOutcome;
  /** The folder the data came from (or that was kept, when not copied). */
  sourceDir?: string;
  sourceKind?: SourceKind;
  sourceSchemaVersion?: number;
}

/** What the user is asked after a failed copy. */
export interface FailurePrompt {
  reason: FailureKind;
  /** One sentence for the user. */
  message: string;
  /** The folder that keeps the old data, shown so the user can find it. */
  keptDir: string;
}

export type FailureChoice = 'retry' | 'start-fresh' | 'quit';

/** The file-system calls the migration makes (a fault-injecting fake in tests). */
export type MigrationFs = Pick<
  typeof fs,
  | 'closeSync'
  | 'copyFileSync'
  | 'existsSync'
  | 'fsyncSync'
  | 'mkdirSync'
  | 'mkdtempSync'
  | 'openSync'
  | 'readFileSync'
  | 'renameSync'
  | 'rmSync'
  | 'statSync'
  | 'writeFileSync'
>;

export interface LegacyInstallDeps {
  fs: MigrationFs;
  /** Opens a SQLite database (`new Database(file, options)`). */
  openDatabase: (file: string, options?: Database.Options) => Database.Database;
  /** Asks the user what to do after a failed copy (production: a message box). */
  prompt: (request: FailurePrompt) => Promise<FailureChoice>;
  logger: {
    info(message: string): unknown;
    warn(message: string): unknown;
    error(message: string): unknown;
  };
  clock: () => Date;
  appVersion: string;
  /** Waits before retrying a locked source. Defaults to a timer. */
  sleep?: (ms: number) => Promise<void>;
}

export type LegacyInstallPaths = Pick<
  AppPaths,
  'userData' | 'dbPath' | 'legacyDbPath' | 'snapshotDir' | 'markerPath'
>;

/** How the source database is opened: read-only, never created, waiting up to 5 s for a lock. */
export const SOURCE_OPEN_OPTIONS: Readonly<Database.Options> = {
  readonly: true,
  fileMustExist: true,
  timeout: 5000,
};

/** The waits before each retry of a locked source: three retries, then the user is asked. */
export const LOCK_RETRY_DELAYS_MS: readonly number[] = [500, 1000, 2000];

/**
 * Backup steps in a row that copy nothing (the source stays locked) before the copy gives
 * up as locked. better-sqlite3 would otherwise retry a busy step for ever.
 */
const STALLED_BACKUP_STEPS = 3;

/** Pages copied per backup step (better-sqlite3's default). */
const BACKUP_PAGES_PER_STEP = 100;

/** A copy that takes longer than this logs its progress at this interval. */
const PROGRESS_LOG_INTERVAL_MS = 2000;

const FAILURE_MESSAGES: Record<FailureKind, string> = {
  locked:
    'The old database is in use by another program. Close WA ParkStay Bookings if it is running, then choose Retry.', // legacy-name-ok
  corrupt: 'The old database is damaged, so it could not be copied.',
  'disk-full': 'There is not enough free disk space to copy your data.',
  unreadable: 'The old data folder could not be read.',
  error: 'Your data could not be copied.',
};

/** A failure the migration recognised itself (a check that did not pass). */
class LegacyInstallError extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = 'LegacyInstallError';
  }
}

interface Source {
  kind: SourceKind;
  dir: string;
  dbPath: string;
}

interface CopiedDatabase {
  schemaVersion: number;
  bytes: number;
}

/**
 * Copies a v1.x install's data into the WA Stay data folder, once. Call it after `ready`
 * and before the database is opened. It never throws for a failed copy: the user chooses
 * Retry, "Start fresh" or Quit (`quit` means the caller starts nothing).
 */
export async function migrateLegacyInstall(
  paths: LegacyInstallPaths,
  deps: LegacyInstallDeps
): Promise<LegacyInstallResult> {
  const { fs: files, logger: log } = deps;

  const marker = readMarker(paths.markerPath, deps);
  if (marker && FINAL_STATUSES.includes(marker.status)) {
    log.info(`legacy-install: already done (${marker.status}); outcome already-done`);
    return { outcome: 'already-done' };
  }

  const tempPath = `${paths.dbPath}.migrating`;
  removeDatabaseFiles(tempPath, files);

  const source = chooseSource(paths, files);
  if (!source) {
    log.info('legacy-install: no legacy data found; outcome fresh-install');
    return { outcome: 'fresh-install' };
  }
  const kept = { sourceDir: source.dir, sourceKind: source.kind };

  if (marker?.status === 'in-progress') {
    // A previous start crashed during the copy: anything it left in the data folder is its
    // own unfinished copy, so copy again from scratch.
    log.warn('legacy-install: a previous copy did not finish; copying again');
    removeDatabaseFiles(paths.dbPath, files);
  } else if (files.existsSync(paths.dbPath)) {
    writeMarkerQuietly(paths, deps, {
      ...markerBase(deps, source),
      status: 'skipped',
      reason: 'target-exists',
      target: paths.dbPath,
      skippedAt: deps.clock().toISOString(),
    });
    log.warn(
      `legacy-install: ${paths.dbPath} already exists, so ${source.dbPath} was not copied over it; outcome target-exists`
    );
    return { outcome: 'target-exists', ...kept };
  }

  for (;;) {
    const started = deps.clock();
    const created: string[] = [];
    try {
      writeMarker(paths, deps, {
        ...markerBase(deps, source),
        status: 'in-progress',
        startedAt: started.toISOString(),
      });
      log.info(`legacy-install: copying the ${source.kind} data from ${source.dir}`);

      const database = await copyDatabase(source, paths, deps, created);
      const copied = [LEGACY_DATABASE_FILE_NAME];
      if (copyGmailStore(source, paths, deps, created)) copied.push(GMAIL_STORE_FILE_NAME);

      writeMarker(paths, deps, {
        ...markerBase(deps, source),
        status: 'complete',
        startedAt: started.toISOString(),
        sourceSchemaVersion: database.schemaVersion,
        migratedAt: deps.clock().toISOString(),
        copied,
      });
      const ms = deps.clock().getTime() - started.getTime();
      log.info(
        `legacy-install: outcome migrated from ${source.kind} ${source.dir}: schema v${database.schemaVersion}, ${database.bytes} bytes, ${ms} ms (${copied.join(', ')})`
      );
      return { outcome: 'migrated', ...kept, sourceSchemaVersion: database.schemaVersion };
    } catch (error) {
      // Undo this attempt: the temp copy and anything it put in place. The source is
      // untouched. Best effort: the user is asked either way.
      try {
        removeDatabaseFiles(tempPath, files);
        for (const file of created.reverse()) removeDatabaseFiles(file, files);
        files.rmSync(`${path.join(paths.userData, GMAIL_STORE_FILE_NAME)}.migrating`, {
          force: true,
        });
      } catch (cleanupError) {
        log.warn(`legacy-install: could not undo the failed copy: ${errorDetail(cleanupError)}`);
      }

      const reason = classify(error);
      const detail = errorDetail(error);
      log.error(`legacy-install: the copy from ${source.dbPath} failed (${reason}: ${detail})`);
      writeMarkerQuietly(paths, deps, {
        ...markerBase(deps, source),
        status: 'failed',
        reason,
        error: detail,
        failedAt: deps.clock().toISOString(),
      });

      const choice = await deps.prompt({
        reason,
        message: FAILURE_MESSAGES[reason],
        keptDir: source.dir,
      });
      log.info(`legacy-install: the user chose ${choice}`);
      if (choice === 'retry') continue;
      if (choice === 'quit') return { outcome: 'quit', ...kept };

      writeMarkerQuietly(paths, deps, {
        ...markerBase(deps, source),
        status: 'declined',
        reason,
        declinedAt: deps.clock().toISOString(),
      });
      log.warn(`legacy-install: starting fresh; the old data stays in ${source.dir}`);
      return { outcome: 'declined', ...kept };
    }
  }
}

function markerBase(
  deps: LegacyInstallDeps,
  source: Source
): Pick<MigrationMarker, 'version' | 'appVersion' | 'source' | 'sourceKind'> {
  return { version: 1, appVersion: deps.appVersion, source: source.dir, sourceKind: source.kind };
}

/** The live legacy folder if it has a database, else the installer's snapshot, else none. */
function chooseSource(paths: LegacyInstallPaths, files: MigrationFs): Source | null {
  if (paths.legacyDbPath && files.existsSync(paths.legacyDbPath)) {
    return { kind: 'legacy', dir: path.dirname(paths.legacyDbPath), dbPath: paths.legacyDbPath };
  }
  const snapshotDb = path.join(paths.snapshotDir, LEGACY_DATABASE_FILE_NAME);
  if (files.existsSync(snapshotDb)) {
    return { kind: 'snapshot', dir: paths.snapshotDir, dbPath: snapshotDb };
  }
  return null;
}

/**
 * Backs the source up to `<dbPath>.migrating`, checks the copy and renames it into place.
 * A locked source is retried (`LOCK_RETRY_DELAYS_MS`). A source SQLite cannot open where it
 * is (a read-only folder with a `-wal` but no `-shm`) is copied to a staging folder in the
 * data folder first and backed up from there.
 */
async function copyDatabase(
  source: Source,
  paths: LegacyInstallPaths,
  deps: LegacyInstallDeps,
  created: string[]
): Promise<CopiedDatabase> {
  const { fs: files, logger: log } = deps;
  const tempPath = `${paths.dbPath}.migrating`;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  files.mkdirSync(paths.userData, { recursive: true });

  let from = source.dbPath;
  let stagingDir: string | null = null;
  let retries = 0;
  try {
    for (;;) {
      try {
        await backupSource(from, tempPath, deps);
        break;
      } catch (error) {
        removeDatabaseFiles(tempPath, files);
        const reason = classify(error);
        if (reason === 'locked' && retries < LOCK_RETRY_DELAYS_MS.length) {
          const delay = LOCK_RETRY_DELAYS_MS[retries];
          retries += 1;
          log.warn(
            `legacy-install: the legacy database is locked (${errorDetail(error)}); retry ${retries} of ${LOCK_RETRY_DELAYS_MS.length} in ${delay} ms`
          );
          await sleep(delay);
          continue;
        }
        if (isCantOpen(error) && stagingDir === null) {
          stagingDir = files.mkdtempSync(path.join(paths.userData, '.legacy-staging-'));
          from = stageSource(source.dbPath, stagingDir, files);
          log.warn(
            `legacy-install: SQLite could not open ${source.dbPath} in place (${errorDetail(error)}); copying it from a staging folder`
          );
          continue;
        }
        throw error;
      }
    }
  } finally {
    if (stagingDir !== null) files.rmSync(stagingDir, { recursive: true, force: true });
  }

  const schemaVersion = verifyCopy(tempPath, deps);
  // Sidecars of an absent database are stray: SQLite would replay a stray -wal into the copy
  removeDatabaseFiles(paths.dbPath, files);
  files.renameSync(tempPath, paths.dbPath);
  created.push(paths.dbPath);
  return { schemaVersion, bytes: files.statSync(paths.dbPath).size };
}

/** Opens the source read-only, checks it and backs it up to `target`. */
async function backupSource(file: string, target: string, deps: LegacyInstallDeps): Promise<void> {
  const db = deps.openDatabase(file, { ...SOURCE_OPEN_OPTIONS });
  try {
    const check = db.pragma('quick_check', { simple: true });
    if (check !== 'ok') {
      throw new LegacyInstallError('corrupt', `quick_check: ${String(check)}`);
    }
    const started = deps.clock().getTime();
    let lastLog = started;
    let previousRemaining = -1;
    let stalled = 0;
    await db.backup(target, {
      progress: ({ totalPages, remainingPages }) => {
        if (remainingPages === previousRemaining) {
          stalled += 1;
          if (stalled >= STALLED_BACKUP_STEPS) {
            throw new LegacyInstallError(
              'locked',
              'the source stayed locked during the copy',
              'SQLITE_BUSY'
            );
          }
        } else {
          stalled = 0;
          previousRemaining = remainingPages;
        }
        const now = deps.clock().getTime();
        if (now - lastLog >= PROGRESS_LOG_INTERVAL_MS) {
          lastLog = now;
          deps.logger.info(
            `legacy-install: copying, ${totalPages - remainingPages} of ${totalPages} pages after ${now - started} ms`
          );
        }
        return BACKUP_PAGES_PER_STEP;
      },
    });
  } finally {
    db.close();
  }
}

/** Copies the database and its `-wal` (the `-shm` is rebuilt) into `dir`; returns the copy. */
function stageSource(dbPath: string, dir: string, files: MigrationFs): string {
  const staged = path.join(dir, path.basename(dbPath));
  files.copyFileSync(dbPath, staged);
  if (files.existsSync(`${dbPath}-wal`)) files.copyFileSync(`${dbPath}-wal`, `${staged}-wal`);
  return staged;
}

/**
 * `PRAGMA integrity_check` on the copy and its schema version. The copy is opened
 * read-write, so closing it removes its own `-wal`/`-shm` before the rename.
 */
function verifyCopy(file: string, deps: LegacyInstallDeps): number {
  const copy = deps.openDatabase(file, { fileMustExist: true });
  try {
    const check = copy.pragma('integrity_check', { simple: true });
    if (check !== 'ok') {
      throw new LegacyInstallError('corrupt', `integrity_check: ${String(check)}`);
    }
    const version = readSchemaVersion(copy);
    if (version > LATEST_SCHEMA_VERSION) {
      deps.logger.warn(
        `legacy-install: the legacy database is at schema v${version}, newer than this build (v${LATEST_SCHEMA_VERSION}); it is copied but cannot be opened by this build`
      );
    }
    return version;
  } finally {
    copy.close();
  }
}

/** `MAX(version)` of `migrations`; 0 for a database older than the table. */
function readSchemaVersion(db: Database.Database): number {
  const table = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migrations'")
    .get();
  if (!table) return 0;
  const row = db.prepare('SELECT MAX(version) AS version FROM migrations').get() as {
    version: number | null;
  };
  return row.version ?? 0;
}

/**
 * Copies `gmail-oauth.json` from next to the source when the data folder has none (through
 * a temp file, so a crash never leaves half a file). Returns whether the data folder now
 * holds the source's file: an identical one left by an unfinished earlier copy counts.
 */
function copyGmailStore(
  source: Source,
  paths: LegacyInstallPaths,
  deps: LegacyInstallDeps,
  created: string[]
): boolean {
  const { fs: files } = deps;
  const from = path.join(source.dir, GMAIL_STORE_FILE_NAME);
  if (!files.existsSync(from)) return false;

  const to = path.join(paths.userData, GMAIL_STORE_FILE_NAME);
  if (files.existsSync(to)) {
    const same = files.readFileSync(to).equals(files.readFileSync(from));
    if (!same) {
      deps.logger.warn(
        `legacy-install: ${GMAIL_STORE_FILE_NAME} already exists in the data folder; kept it`
      );
    }
    return same;
  }
  const temp = `${to}.migrating`;
  files.copyFileSync(from, temp);
  files.renameSync(temp, to);
  created.push(to);
  return true;
}

/** Removes a database file and its SQLite sidecars, if present. */
function removeDatabaseFiles(file: string, files: MigrationFs): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    files.rmSync(`${file}${suffix}`, { force: true });
  }
}

function readMarker(markerPath: string, deps: LegacyInstallDeps): MigrationMarker | null {
  const { fs: files } = deps;
  if (!files.existsSync(markerPath)) return null;
  try {
    const parsed = JSON.parse(files.readFileSync(markerPath, 'utf8')) as Partial<MigrationMarker>;
    if (parsed && typeof parsed === 'object' && typeof parsed.status === 'string') {
      return parsed as MigrationMarker;
    }
  } catch {
    // Damaged: treated as absent below
  }
  deps.logger.warn(`legacy-install: ${markerPath} is unreadable; treating it as absent`);
  return null;
}

/** Writes the marker atomically: a temp file, fsynced, then renamed over it. */
function writeMarker(paths: LegacyInstallPaths, deps: LegacyInstallDeps, marker: MigrationMarker) {
  const { fs: files } = deps;
  files.mkdirSync(path.dirname(paths.markerPath), { recursive: true });
  const temp = `${paths.markerPath}.tmp`;
  try {
    const fd = files.openSync(temp, 'w');
    try {
      files.writeFileSync(fd, `${JSON.stringify(marker, null, 2)}\n`);
      files.fsyncSync(fd);
    } finally {
      files.closeSync(fd);
    }
    files.renameSync(temp, paths.markerPath);
  } catch (error) {
    files.rmSync(temp, { force: true });
    throw error;
  }
}

/** `writeMarker` for the failure paths: a marker that cannot be written is logged, not thrown. */
function writeMarkerQuietly(
  paths: LegacyInstallPaths,
  deps: LegacyInstallDeps,
  marker: MigrationMarker
): void {
  try {
    writeMarker(paths, deps, marker);
  } catch (error) {
    deps.logger.warn(
      `legacy-install: could not write ${paths.markerPath} (${marker.status}): ${errorDetail(error)}`
    );
  }
}

function errorCode(error: unknown): string {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  return code === undefined || code === null ? '' : String(code);
}

/** The error's code and message, for the log and the marker (SQLite and fs messages hold no data). */
function errorDetail(error: unknown): string {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  return code && !message.includes(code) ? `${code} ${message}` : message;
}

function isCantOpen(error: unknown): boolean {
  return errorCode(error).startsWith('SQLITE_CANTOPEN');
}

function classify(error: unknown): FailureKind {
  if (error instanceof LegacyInstallError) return error.kind;
  const code = errorCode(error);
  if (code.startsWith('SQLITE_BUSY') || code.startsWith('SQLITE_LOCKED')) return 'locked';
  if (code.startsWith('SQLITE_CORRUPT') || code === 'SQLITE_NOTADB') return 'corrupt';
  if (code === 'ENOSPC' || code.startsWith('SQLITE_FULL')) return 'disk-full';
  if (
    code.startsWith('SQLITE_CANTOPEN') ||
    code.startsWith('SQLITE_PERM') ||
    code.startsWith('SQLITE_AUTH') ||
    code === 'EACCES' ||
    code === 'EPERM'
  ) {
    return 'unreadable';
  }
  return 'error';
}

/** The message box buttons, in order. */
const PROMPT_CHOICES: readonly FailureChoice[] = ['retry', 'start-fresh', 'quit'];

/** The part of Electron's `dialog` the production prompt uses. */
export interface PromptDialog {
  showMessageBox(options: {
    type: 'error';
    title: string;
    message: string;
    detail: string;
    buttons: string[];
    defaultId: number;
    cancelId: number;
    noLink: boolean;
  }): Promise<{ response: number }>;
}

/**
 * The production prompt: a message box (there is no window yet) with Retry, "Start fresh"
 * and Quit. Closing it counts as Quit.
 */
export function dialogPrompt(dialog: PromptDialog): LegacyInstallDeps['prompt'] {
  return async ({ message, keptDir }) => {
    const { response } = await dialog.showMessageBox({
      type: 'error',
      title: 'WA Stay',
      message: 'WA Stay could not copy your data from WA ParkStay Bookings', // legacy-name-ok
      detail: [
        message,
        '',
        `Your old data is kept, unchanged, in:\n${keptDir}`,
        '',
        'Retry: try again.',
        'Start fresh: open WA Stay without your old data. It stays in that folder.',
        'Quit: close WA Stay and try again later.',
      ].join('\n'),
      buttons: ['Retry', 'Start fresh', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    });
    return PROMPT_CHOICES[response] ?? 'quit';
  };
}

/** The dependencies for the running app. */
export function createLegacyInstallDeps(options: {
  dialog: PromptDialog;
  appVersion: string;
}): LegacyInstallDeps {
  return {
    fs,
    openDatabase: (file, databaseOptions) => new Database(file, databaseOptions),
    prompt: dialogPrompt(options.dialog),
    logger: appLogger,
    clock: () => new Date(),
    appVersion: options.appVersion,
  };
}

export const WELCOME_NOTICE_TITLE = 'Your data has moved to WA Stay';

export interface FinishLegacyInstallDeps {
  notifications: { create(input: NotificationInput): unknown };
  /** The local profile (it owns the notice). */
  userId: number;
  /** The migrated `launchOnStartup` setting. */
  launchOnStartup: boolean;
  /** Replaces the v1.x launch-at-login entry (`app/login-item.ts`). */
  replaceLoginItems: (launchOnStartup: boolean) => unknown;
  logger: { warn(message: string): unknown };
}

/**
 * The follow-ups of a copy made in this start, once the database is open: one in-app
 * notice saying where the old data is kept, and launch at login re-registered under the
 * new identity. After any other outcome (including every later start) it does nothing.
 * Neither step stops the app starting.
 */
export function finishLegacyInstall(
  result: LegacyInstallResult,
  deps: FinishLegacyInstallDeps
): void {
  if (result.outcome !== 'migrated' || !result.sourceDir) return;

  try {
    deps.notifications.create({
      userId: deps.userId,
      type: NotificationType.INFO,
      title: WELCOME_NOTICE_TITLE,
      message:
        'Your watches, bookings, settings and connections were copied from WA ParkStay Bookings. ' + // legacy-name-ok
        `The old data is kept, unchanged, as a backup in ${result.sourceDir}`,
    });
  } catch (error) {
    deps.logger.warn(`legacy-install: could not add the welcome notice: ${errorDetail(error)}`);
  }

  try {
    deps.replaceLoginItems(deps.launchOnStartup);
  } catch (error) {
    deps.logger.warn(
      `legacy-install: could not re-register launch at login: ${errorDetail(error)}`
    );
  }
}
