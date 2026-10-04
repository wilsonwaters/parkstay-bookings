/**
 * The v1.x decryptors recover the fixture plaintexts: P2's `users` and notifier rows (machine
 * id `fixture-machine-id`) and a `gmail-oauth.json` written in this test by the installed
 * conf@10.2.0 with the legacy key. Wrong keys and malformed input throw LegacyDecryptError.
 */

import fs from 'fs';
import type Database from 'better-sqlite3';
import {
  decryptLegacyGmailStore,
  decryptLegacyNotifierConfig,
  decryptLegacyUserPassword,
  legacyMachineId,
  LegacyDecryptError,
} from '@main/security/legacy-decryptors';
import {
  FIXTURE_MACHINE_ID,
  FIXTURE_SMTP_PASSWORD,
  FIXTURE_USER_PASSWORD,
} from '@tests/fixtures/db/constants';
import { disposeFixture, loadFixture } from '@tests/utils/database-helper';
import { removeUserData, tempUserData } from '@tests/utils/fake-safe-storage';
import {
  LEGACY_GMAIL_CREDENTIALS,
  LEGACY_GMAIL_TOKENS,
  writeLegacyGmailStore,
} from '@tests/utils/legacy-gmail-store';

jest.mock('node-machine-id', () => ({ machineIdSync: () => 'mocked-machine-id' }));

/** The full notifier config plaintext documented in tests/fixtures/db/README.md. */
const FIXTURE_NOTIFIER_CONFIG = {
  preset: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: 'fixture.user@example.com', pass: FIXTURE_SMTP_PASSWORD },
  toEmail: 'fixture.user@example.com',
};

interface UserRow {
  encrypted_password: string;
  encryption_iv: string;
  encryption_auth_tag: string;
}

describe('legacy decryptors', () => {
  let db: Database.Database;
  let user: UserRow;
  let notifierConfig: string;

  beforeAll(() => {
    db = loadFixture('v5-release-1.2.0');
    user = db
      .prepare('SELECT encrypted_password, encryption_iv, encryption_auth_tag FROM users')
      .get() as UserRow;
    notifierConfig = (
      db.prepare('SELECT config FROM notification_providers').get() as { config: string }
    ).config;
  });

  afterAll(() => disposeFixture(db));

  const legacyUser = (row: UserRow) => ({
    encrypted: row.encrypted_password,
    iv: row.encryption_iv,
    authTag: row.encryption_auth_tag,
  });

  it('auth: recovers the fixture ParkStay password with the fixture machine id', () => {
    expect(decryptLegacyUserPassword(legacyUser(user), FIXTURE_MACHINE_ID)).toBe(
      FIXTURE_USER_PASSWORD
    );
  });

  it('notifier: recovers the fixture SMTP config (iv:authTag:ciphertext)', () => {
    expect(notifierConfig).toMatch(/^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/);
    expect(JSON.parse(decryptLegacyNotifierConfig(notifierConfig, FIXTURE_MACHINE_ID))).toEqual(
      FIXTURE_NOTIFIER_CONFIG
    );
  });

  it('gmail: recovers a gmail-oauth.json written by conf@10.2.0 with the legacy key', () => {
    const dir = tempUserData();
    try {
      const file = writeLegacyGmailStore(dir);
      const raw = fs.readFileSync(file);
      // conf's encrypted format: 16-byte IV, ':', AES-256-CBC; nothing readable in it
      expect(raw.subarray(16, 17).toString()).toBe(':');
      expect(raw.includes(Buffer.from(LEGACY_GMAIL_CREDENTIALS.clientSecret))).toBe(false);

      expect(JSON.parse(decryptLegacyGmailStore(raw))).toEqual({
        gmail_credentials: LEGACY_GMAIL_CREDENTIALS,
        gmail_oauth_tokens: LEGACY_GMAIL_TOKENS,
      });
    } finally {
      removeUserData(dir);
    }
  });

  it('wrong key: another machine id, or a store written with another key, throws', () => {
    expect(() => decryptLegacyUserPassword(legacyUser(user), 'another-machine')).toThrow(
      LegacyDecryptError
    );
    expect(() => decryptLegacyNotifierConfig(notifierConfig, 'another-machine')).toThrow(
      LegacyDecryptError
    );

    const dir = tempUserData();
    try {
      const raw = fs.readFileSync(writeLegacyGmailStore(dir, undefined, 'some-other-key'));
      // As in conf: with the wrong key the bytes fail CBC padding (LegacyDecryptError) or,
      // rarely, decrypt to garbage that is not JSON. Either way nothing is recovered.
      expect(() => JSON.parse(decryptLegacyGmailStore(raw))).toThrow();
    } finally {
      removeUserData(dir);
    }
  });

  it('malformed input throws LegacyDecryptError; plain JSON passes through as conf read it', () => {
    for (const config of [
      '',
      'not-hex:zz:yy',
      'a0b1:c2d3',
      `${'0'.repeat(32)}:${'0'.repeat(32)}:ab`,
    ]) {
      expect(() => decryptLegacyNotifierConfig(config, FIXTURE_MACHINE_ID)).toThrow(
        LegacyDecryptError
      );
    }
    expect(() =>
      decryptLegacyUserPassword({ encrypted: 'zz', iv: 'xx', authTag: 'yy' }, FIXTURE_MACHINE_ID)
    ).toThrow(LegacyDecryptError);
    expect(() =>
      decryptLegacyUserPassword({ ...legacyUser(user), iv: '' }, FIXTURE_MACHINE_ID)
    ).toThrow(LegacyDecryptError);

    const truncated = Buffer.concat([Buffer.alloc(16, 1), Buffer.from(':'), Buffer.alloc(5)]);
    expect(() => decryptLegacyGmailStore(truncated)).toThrow(LegacyDecryptError);
    expect(decryptLegacyGmailStore(Buffer.from('{"a":1}'))).toBe('{"a":1}');
  });

  it('legacyMachineId reads node-machine-id (the hashed id the v1.x keys used)', () => {
    expect(legacyMachineId()).toBe('mocked-machine-id');
  });
});
