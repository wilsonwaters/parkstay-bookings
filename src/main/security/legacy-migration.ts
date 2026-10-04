/**
 * Startup migration of the v1.x secrets to SecretVault envelopes (architecture-notes §7):
 * each legacy ciphertext is decrypted once with the legacy algorithm and re-encrypted.
 *
 * Runs in `createContainer` after the database migrations and before anything reads a
 * secret, on every start. It is idempotent and migrates each item on its own (one
 * transaction per database row, an atomic rename for the Gmail file), so a crash leaves
 * each item either old or new and the next start finishes the job. An item that cannot be
 * decrypted is left exactly as it is: its consumer reports it as `unreadable`, and the next
 * start tries again. Values are never logged.
 *
 * The legacy value is the only copy, so each new envelope is decrypted and compared with
 * the plaintext (`vault.encryptVerified`) before it replaces it. One that does not read back
 * leaves the item unchanged and counts it as `failed`.
 *
 * - `notifiers.config`: replaced by the envelope.
 * - `gmail-oauth.json`: rewritten as format 2 (`gmail-secret-file.ts`).
 *
 * The v1.x ParkStay password (`users`) is not migrated: ParkStay never used it, and migration
 * v9 drops its columns before this runs (architecture-notes §12.32).
 *
 * An empty legacy notifier config migrates to `''`, which reads as `missing`.
 */

import type Database from 'better-sqlite3';
import { logger } from '../utils/logger';
import {
  readGmailSecretFile,
  writeGmailSecretFile,
  type GmailSecretFileV2,
} from './gmail-secret-file';
import { decryptLegacyGmailStore, decryptLegacyNotifierConfig } from './legacy-decryptors';
import { SecretVaultNotReadyError, type SecretVault } from './secret-vault';

export interface MigrateLegacySecretsOptions {
  db: Database.Database;
  vault: SecretVault;
  /**
   * Reads the machine id the v1.x keys were derived from (`legacyMachineId`). Called only
   * when a machine-bound legacy value is found, at most once per run.
   */
  machineId: () => string;
  /** `<userData>/gmail-oauth.json`. */
  gmailStorePath: string;
}

export interface LegacyMigrationResult {
  /** Items re-encrypted (or emptied) in this run. */
  migrated: number;
  /** Items already vault envelopes, or with nothing stored. */
  current: number;
  /** Items that could not be decrypted; left unchanged. */
  failed: number;
}

interface NotifierRow {
  id: number;
  channel: string;
  config: string;
}

type Outcome = keyof LegacyMigrationResult;

export function migrateLegacySecrets({
  db,
  vault,
  machineId,
  gmailStorePath,
}: MigrateLegacySecretsOptions): LegacyMigrationResult {
  const result: LegacyMigrationResult = { migrated: 0, current: 0, failed: 0 };
  const count = (outcome: Outcome | null): void => {
    if (outcome) result[outcome] += 1;
  };
  let cachedMachineId: string | undefined;
  const getMachineId = (): string => (cachedMachineId ??= machineId());

  const notifiers = db.prepare('SELECT id, channel, config FROM notifiers').all() as NotifierRow[];
  for (const row of notifiers) {
    count(attempt(`notifier ${row.channel}`, () => migrateNotifier(row)));
  }

  count(attempt('gmail-oauth.json', migrateGmailFile));

  logger.info(
    `Legacy secrets: ${result.migrated} migrated, ${result.current} current, ${result.failed} failed`
  );
  return result;

  function migrateNotifier(row: NotifierRow): Outcome {
    if (row.config === '' || vault.isEnvelope(row.config)) return 'current';

    const config = decryptLegacyNotifierConfig(row.config, getMachineId());
    const envelope = isEmptyConfig(config) ? '' : vault.encryptVerified(config);
    db.transaction(() => {
      db.prepare('UPDATE notifiers SET config = ? WHERE id = ? AND config = ?').run(
        envelope,
        row.id,
        row.config
      );
    })();
    return 'migrated';
  }

  function migrateGmailFile(): Outcome | null {
    const stored = readGmailSecretFile(gmailStorePath);
    if (stored.kind === 'missing') return null;
    if (stored.kind === 'v2') return 'current';

    let legacy: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(decryptLegacyGmailStore(stored.data));
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      legacy = parsed as Record<string, unknown>;
    } catch {
      throw new Error('The legacy Gmail store is damaged');
    }

    const file: GmailSecretFileV2 = { format: 2 };
    if (legacy.gmail_credentials) {
      file.credentials = vault.encryptVerified(JSON.stringify(legacy.gmail_credentials));
    }
    if (legacy.gmail_oauth_tokens) {
      file.tokens = vault.encryptVerified(JSON.stringify(legacy.gmail_oauth_tokens));
    }
    writeGmailSecretFile(gmailStorePath, file);
    return 'migrated';
  }
}

/** Runs one item's migration; a failure is logged (by name only) and counted, never thrown. */
function attempt(item: string, migrate: () => Outcome | null): Outcome | null {
  try {
    return migrate();
  } catch (error) {
    // A startup-order bug, not a bad item: fail the start
    if (error instanceof SecretVaultNotReadyError) throw error;
    logger.warn(
      `Legacy secrets: ${item} could not be migrated and was left unchanged (${describe(error)})`
    );
    return 'failed';
  }
}

/** The error's message for our own errors; never anything that could carry a value. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}

/** `''` or a JSON object with no fields: nothing worth storing. */
function isEmptyConfig(config: string): boolean {
  if (config.trim() === '') return true;
  try {
    const parsed: unknown = JSON.parse(config);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 0
    );
  } catch {
    return false;
  }
}
