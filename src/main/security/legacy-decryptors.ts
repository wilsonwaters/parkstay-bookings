/**
 * Decryptors for the v1.x secret schemes, used only by `migrateLegacySecrets` to read each
 * legacy ciphertext once before it is re-encrypted with the SecretVault. They decrypt and
 * never encrypt.
 *
 * The algorithms and constants are exact copies of the v1.x code. legacy: never change.
 * Any difference makes existing users' stored secrets unreadable.
 *
 * 1. Notifier config (`notifiers.config`): AES-256-GCM with key
 *    `PBKDF2(machineId + 'parkstay-notification-providers-v1', 'parkstay-provider-salt',
 *    100000, 32, sha512)`, stored as hex `iv:authTag:ciphertext` (v1.x notification-provider
 *    repository).
 * 2. Gmail OAuth store (`gmail-oauth.json`): electron-store 8.2.0 / conf 10.2.0 with the
 *    hard-coded `encryptionKey` below: `IV (16 bytes) + ':' + AES-256-CBC`, key
 *    `PBKDF2(encryptionKey, iv.toString(), 10000, 32, sha512)` (conf `_encryptData`/`_write`).
 *
 * `node-machine-id` is imported only here. The composition root passes `legacyMachineId` to
 * `migrateLegacySecrets`, which calls it only when it finds a machine-bound legacy value.
 */

import crypto from 'crypto';
import { machineIdSync } from 'node-machine-id';

// legacy: never change (v1.x notification-provider repository)
const NOTIFIER_CONFIG_SECRET = 'parkstay-notification-providers-v1';
const NOTIFIER_SALT = 'parkstay-provider-salt';
// legacy: never change — existing data depends on it (v1.x oauth2-handler electron-store options)
const GMAIL_STORE_ENCRYPTION_KEY = 'parkstay-gmail-oauth-encryption-key';
// legacy: never change (v1.x key derivation and ciphers)
const GCM_PBKDF2_ITERATIONS = 100000;
const CONF_PBKDF2_ITERATIONS = 10000;
const KEY_BYTES = 32;
const DIGEST = 'sha512';

/** A legacy ciphertext that could not be decrypted (wrong machine id, damaged, wrong format). */
export class LegacyDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LegacyDecryptError';
  }
}

/** The machine id the v1.x key derivation used (node-machine-id's hashed id). */
export function legacyMachineId(): string {
  return machineIdSync();
}

/** A v1.x notifier config ciphertext: hex `iv:authTag:ciphertext`. */
export const LEGACY_NOTIFIER_CONFIG = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]*$/;

const HEX = /^[0-9a-f]*$/;

const derivedKeys = new Map<string, Buffer>();

function gcmKey(machineId: string, secret: string, salt: string): Buffer {
  const cacheKey = `${secret}\u0000${salt}\u0000${machineId}`;
  let key = derivedKeys.get(cacheKey);
  if (!key) {
    key = crypto.pbkdf2Sync(machineId + secret, salt, GCM_PBKDF2_ITERATIONS, KEY_BYTES, DIGEST);
    derivedKeys.set(cacheKey, key);
  }
  return key;
}

function decryptGcm(key: Buffer, ivHex: string, authTagHex: string, encryptedHex: string): string {
  if (!HEX.test(ivHex) || !HEX.test(authTagHex) || !HEX.test(encryptedHex) || !ivHex) {
    throw new LegacyDecryptError('Not a legacy ciphertext');
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    throw new LegacyDecryptError('The legacy ciphertext could not be decrypted');
  }
}

/** Decrypts a v1.x notifier config (`iv:authTag:ciphertext`). Throws `LegacyDecryptError`. */
export function decryptLegacyNotifierConfig(ciphertext: string, machineId: string): string {
  if (!LEGACY_NOTIFIER_CONFIG.test(ciphertext)) {
    throw new LegacyDecryptError('Not a legacy notifier config');
  }
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  return decryptGcm(
    gcmKey(machineId, NOTIFIER_CONFIG_SECRET, NOTIFIER_SALT),
    ivHex,
    authTagHex,
    encrypted
  );
}

/**
 * Decrypts a v1.x `gmail-oauth.json` (the raw file bytes) to its JSON text, as conf 10.2.0
 * read it: the `IV + ':' + AES-256-CBC` format is decrypted; any other content is returned
 * as it is (conf did the same, so a plain JSON file still reads). Throws `LegacyDecryptError`
 * when the encrypted format does not decrypt. The caller parses the JSON.
 */
export function decryptLegacyGmailStore(data: Buffer): string {
  if (data.subarray(16, 17).toString() !== ':') return data.toString();
  try {
    const initializationVector = data.subarray(0, 16);
    const password = crypto.pbkdf2Sync(
      GMAIL_STORE_ENCRYPTION_KEY,
      initializationVector.toString(),
      CONF_PBKDF2_ITERATIONS,
      KEY_BYTES,
      DIGEST
    );
    const decipher = crypto.createDecipheriv('aes-256-cbc', password, initializationVector);
    return Buffer.concat([decipher.update(data.subarray(17)), decipher.final()]).toString('utf8');
  } catch {
    throw new LegacyDecryptError('The legacy Gmail store could not be decrypted');
  }
}
