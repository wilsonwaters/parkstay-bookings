/**
 * `migrateLegacySecrets` on the real v5 (v1.2.0) and v6 fixtures, loaded and upgraded to v7,
 * plus a v1.x `gmail-oauth.json` written by conf@10.2.0:
 *
 * - every legacy ciphertext becomes a vault envelope that decrypts to the original plaintext,
 *   with no legacy layout left; a second run reports `migrated: 0`;
 * - with the wrong machine id the rows stay byte-identical, the notifier reads as
 *   `unreadable`/`error`, the dispatcher never calls `send`, and no secret is logged;
 * - the Gmail file edge cases (missing, already format 2, damaged) and a crash part-way;
 * - after saving secrets, a byte scan of the database (and its WAL) and of gmail-oauth.json
 *   finds none of the plaintexts.
 */

import fs from 'fs';
import path from 'path';
import { Writable } from 'stream';
import winston from 'winston';
import type Database from 'better-sqlite3';
import { openDatabase, runMigrations } from '@main/database/connection';
import { createContainer, type AppContainer } from '@main/app/container';
import { registerIpcHandlers } from '@main/ipc';
import { migrateLegacySecrets } from '@main/security/legacy-migration';
import { parseGmailSecretFile } from '@main/security/gmail-secret-file';
import { AuthService } from '@main/services/auth/AuthService';
import { NotifierRepository, UserRepository } from '@main/database/repositories';
import { OAuth2Handler } from '@main/services/gmail/oauth2-handler';
import { logger } from '@main/utils/logger';
import { NotifierChannel, NotifierStatus, SMTPPreset } from '@shared/types';
import type { APIResponse } from '@shared/types';
import {
  FIXTURE_MACHINE_ID,
  FIXTURE_SMTP_PASSWORD,
  FIXTURE_USER_PASSWORD,
  type FixtureName,
} from '@tests/fixtures/db/constants';
import { disposeFixture, loadFixture } from '@tests/utils/database-helper';
import {
  containerSecrets,
  FakeSafeStorage,
  removeUserData,
  testVault,
  type TestVault,
} from '@tests/utils/fake-safe-storage';
import { FakeIpcMain, fakeEvent, TEST_LOGS_DIR } from '@tests/utils/ipc-harness';
import {
  LEGACY_GMAIL_CREDENTIALS,
  LEGACY_GMAIL_TOKENS,
  writeLegacyGmailStore,
} from '@tests/utils/legacy-gmail-store';

let mockMachineId = FIXTURE_MACHINE_ID;
jest.mock('node-machine-id', () => ({ machineIdSync: () => mockMachineId }));
jest.mock('electron', () => jest.requireActual('@tests/utils/electron-mocks').electron());
jest.mock('electron-updater', () =>
  jest.requireActual('@tests/utils/electron-mocks').electronUpdater()
);
// SMTP connections and sends are recorded, never made
const mockSmtp = { connections: 0, sent: 0 };
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: () => {
      mockSmtp.connections += 1;
      return {
        verify: async () => true,
        sendMail: async () => {
          mockSmtp.sent += 1;
          return { messageId: 'test-message' };
        },
      };
    },
  },
}));

const FIXTURES: FixtureName[] = ['v5-release-1.2.0', 'v6-branch'];

/** The documented plaintext of the fixture's SMTP notifier config. */
const FIXTURE_NOTIFIER_CONFIG = {
  preset: 'gmail',
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: { user: 'fixture.user@example.com', pass: FIXTURE_SMTP_PASSWORD },
  toEmail: 'fixture.user@example.com',
};

const LEGACY_NOTIFIER_LAYOUT = /^[0-9a-f]{32}:[0-9a-f]{32}:/;
const HEX = /^[0-9a-f]+$/;

/** Every plaintext the fixtures and the legacy Gmail store hold. */
const LEGACY_PLAINTEXTS = [
  FIXTURE_USER_PASSWORD,
  FIXTURE_SMTP_PASSWORD,
  LEGACY_GMAIL_CREDENTIALS.clientSecret,
  LEGACY_GMAIL_TOKENS.access_token,
  LEGACY_GMAIL_TOKENS.refresh_token,
];

/** A fixture loaded and upgraded to v7 (the database migrations run before this one). */
function loadUpgraded(name: FixtureName): Database.Database {
  const db = loadFixture(name);
  runMigrations(db);
  return db;
}

function rows(db: Database.Database, table: 'users' | 'notifiers'): Record<string, unknown>[] {
  return db.prepare(`SELECT * FROM ${table} ORDER BY id`).all() as Record<string, unknown>[];
}

/** Captures every log line (debug included) while `run` runs; the console stays quiet. */
async function captureLogs<T>(run: () => Promise<T> | T): Promise<{ result: T; logs: string }> {
  const lines: string[] = [];
  const capture = new winston.transports.Stream({
    stream: new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    }),
  });
  const levelBefore = logger.level;
  logger.add(capture);
  logger.level = 'debug';
  const silenced = logger.transports.filter((t) => t !== capture);
  silenced.forEach((t) => (t.silent = true));
  try {
    const result = await run();
    return { result, logs: lines.join('\n') };
  } finally {
    logger.remove(capture);
    logger.level = levelBefore;
    silenced.forEach((t) => (t.silent = false));
  }
}

describe.each(FIXTURES)('migrateLegacySecrets on the %s fixture', (fixture) => {
  let db: Database.Database;
  let t: TestVault;
  let gmailStorePath: string;

  const migrate = (machineId: string = FIXTURE_MACHINE_ID) =>
    migrateLegacySecrets({ db, vault: t.vault, machineId, gmailStorePath });

  beforeEach(() => {
    mockMachineId = FIXTURE_MACHINE_ID;
    db = loadUpgraded(fixture);
    t = testVault();
    gmailStorePath = writeLegacyGmailStore(t.userDataDir);
  });

  afterEach(() => {
    disposeFixture(db);
    removeUserData(t.userDataDir);
  });

  it('re-encrypts every legacy secret: no legacy layout left, and each decrypts to its original plaintext', () => {
    // Not vacuous: the fixture holds the legacy layouts
    expect(rows(db, 'users')[0]).toMatchObject({
      encrypted_password: expect.stringMatching(HEX),
      encryption_iv: expect.stringMatching(HEX),
      encryption_auth_tag: expect.stringMatching(HEX),
    });
    expect(rows(db, 'notifiers')[0].config).toMatch(LEGACY_NOTIFIER_LAYOUT);

    expect(migrate()).toEqual({ migrated: 3, current: 0, failed: 0 });

    const [user] = rows(db, 'users');
    expect(user).toMatchObject({
      encrypted_password: expect.stringMatching(/^vault:v1:os:/),
      encryption_iv: '',
      encryption_auth_tag: '',
      encryption_key: '',
    });
    for (const row of [...rows(db, 'users'), ...rows(db, 'notifiers')]) {
      for (const value of Object.values(row)) {
        if (typeof value !== 'string') continue;
        expect(value).not.toMatch(LEGACY_NOTIFIER_LAYOUT);
        if (value.length >= 32) expect(value).not.toMatch(HEX);
      }
    }
    expect(t.vault.decrypt(user.encrypted_password as string)).toBe(FIXTURE_USER_PASSWORD);

    const [notifier] = rows(db, 'notifiers');
    expect(notifier.config).toMatch(/^vault:v1:os:/);
    expect(JSON.parse(t.vault.decrypt(notifier.config as string))).toEqual(FIXTURE_NOTIFIER_CONFIG);

    const raw = fs.readFileSync(gmailStorePath);
    const file = parseGmailSecretFile(raw);
    expect(file).toEqual({
      format: 2,
      credentials: expect.stringMatching(/^vault:v1:os:/),
      tokens: expect.stringMatching(/^vault:v1:os:/),
    });
    expect(JSON.parse(t.vault.decrypt(file?.credentials as string))).toEqual(
      LEGACY_GMAIL_CREDENTIALS
    );
    expect(JSON.parse(t.vault.decrypt(file?.tokens as string))).toEqual(LEGACY_GMAIL_TOKENS);
    for (const plaintext of LEGACY_PLAINTEXTS) {
      expect(raw.includes(Buffer.from(plaintext))).toBe(false);
    }
    // Written atomically: no temp file left beside it
    expect(fs.readdirSync(t.userDataDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('is idempotent: a second run reports migrated 0 and changes nothing', () => {
    migrate();
    const users = rows(db, 'users');
    const notifiers = rows(db, 'notifiers');
    const gmail = fs.readFileSync(gmailStorePath);

    expect(migrate()).toEqual({ migrated: 0, current: 3, failed: 0 });
    expect(rows(db, 'users')).toEqual(users);
    expect(rows(db, 'notifiers')).toEqual(notifiers);
    expect(fs.readFileSync(gmailStorePath).equals(gmail)).toBe(true);
  });

  it('the consumers read the migrated secrets', async () => {
    migrate();

    await expect(
      new AuthService(new UserRepository(db), t.vault).getCredentials()
    ).resolves.toEqual({ email: 'fixture.user@example.com', password: FIXTURE_USER_PASSWORD });
    expect(
      new NotifierRepository(db, t.vault).findByChannel(NotifierChannel.EMAIL_SMTP)
    ).toMatchObject({ secretState: 'ok', config: FIXTURE_NOTIFIER_CONFIG });
    const oauth = new OAuth2Handler({ vault: t.vault, filePath: gmailStorePath });
    expect(oauth.getCredentials()).toEqual({
      clientId: LEGACY_GMAIL_CREDENTIALS.clientId,
      clientSecret: LEGACY_GMAIL_CREDENTIALS.clientSecret,
    });
    expect(oauth.getAuthStatus()).toEqual({
      isAuthorized: true,
      expiryDate: LEGACY_GMAIL_TOKENS.expiry_date,
      secretState: 'ok',
    });
  });

  it('with the wrong machine id leaves the rows byte-identical and counts them failed, logging no value', async () => {
    const users = rows(db, 'users');
    const notifiers = rows(db, 'notifiers');

    const { result, logs } = await captureLogs(() => migrate('another-machine'));

    expect(result).toEqual({ migrated: 1, current: 0, failed: 2 }); // the Gmail key is not machine-bound
    expect(rows(db, 'users')).toEqual(users);
    expect(rows(db, 'notifiers')).toEqual(notifiers);
    expect(logs).toMatch(/users row 1 could not be migrated and was left unchanged/);
    expect(logs).toMatch(/notifier email_smtp could not be migrated and was left unchanged/);
    for (const value of [...LEGACY_PLAINTEXTS, users[0].encrypted_password as string]) {
      expect(logs).not.toContain(value);
    }

    // The next start tries again, and with the right id it finishes the job
    expect(migrate()).toEqual({ migrated: 2, current: 1, failed: 0 });
  });

  it('a crash part-way leaves each item old or new; the next run finishes', () => {
    const realEncrypt = t.vault.encrypt.bind(t.vault);
    const encrypt = jest.spyOn(t.vault, 'encrypt');
    encrypt.mockImplementationOnce(realEncrypt); // users row: fine
    encrypt.mockImplementationOnce(() => {
      throw new Error('simulated crash');
    }); // notifier: fails before its UPDATE
    const notifierBefore = rows(db, 'notifiers');

    expect(migrate()).toEqual({ migrated: 2, current: 0, failed: 1 });
    expect(rows(db, 'users')[0].encrypted_password).toMatch(/^vault:v1:os:/);
    expect(rows(db, 'notifiers')).toEqual(notifierBefore);

    encrypt.mockRestore();
    expect(migrate()).toEqual({ migrated: 1, current: 2, failed: 0 });
    expect(rows(db, 'notifiers')[0].config).toMatch(/^vault:v1:os:/);
  });
});

describe('migrateLegacySecrets edge cases', () => {
  let db: Database.Database;
  let t: TestVault;
  let gmailStorePath: string;

  const migrate = () =>
    migrateLegacySecrets({ db, vault: t.vault, machineId: FIXTURE_MACHINE_ID, gmailStorePath });

  beforeEach(() => {
    db = loadUpgraded('v5-release-1.2.0');
    t = testVault();
    gmailStorePath = path.join(t.userDataDir, 'gmail-oauth.json');
  });

  afterEach(() => {
    disposeFixture(db);
    removeUserData(t.userDataDir);
  });

  it('an empty legacy password and an empty notifier config migrate as missing, not unreadable', () => {
    // v1.x encrypted '' to an empty GCM ciphertext with an IV and tag
    db.prepare(
      `UPDATE users SET encrypted_password = '', encryption_iv = 'aa', encryption_auth_tag = 'bb'`
    ).run();
    db.prepare(`UPDATE notifiers SET config = ''`).run();

    expect(migrate()).toEqual({ migrated: 1, current: 1, failed: 0 });
    expect(rows(db, 'users')[0]).toMatchObject({
      encrypted_password: '',
      encryption_iv: '',
      encryption_auth_tag: '',
      encryption_key: '',
    });
    const auth = new AuthService(new UserRepository(db), t.vault);
    expect(auth.getCredentialStatus()).toEqual({
      email: 'fixture.user@example.com',
      hasPassword: false,
      secretState: 'missing',
    });
    expect(
      new NotifierRepository(db, t.vault).findByChannel(NotifierChannel.EMAIL_SMTP)
    ).toMatchObject({ secretState: 'missing', config: {} });
  });

  it('gmail-oauth.json: a missing file is not configured, and a format-2 file is left as it is', () => {
    expect(migrate()).toEqual({ migrated: 2, current: 0, failed: 0 });
    expect(fs.existsSync(gmailStorePath)).toBe(false);

    const oauth = new OAuth2Handler({ vault: t.vault, filePath: gmailStorePath });
    oauth.setCredentials({ clientId: 'id', clientSecret: 'format-2-secret' });
    const before = fs.readFileSync(gmailStorePath);

    expect(migrate()).toEqual({ migrated: 0, current: 3, failed: 0 });
    expect(fs.readFileSync(gmailStorePath).equals(before)).toBe(true);
  });

  it('gmail-oauth.json: damaged content is unreadable and kept; a user save moves it to .corrupt-<ts>', () => {
    const damaged = Buffer.from('{"format": 2, "credentials": "vault:v1:os:AAA');
    fs.mkdirSync(t.userDataDir, { recursive: true });
    fs.writeFileSync(gmailStorePath, damaged);

    expect(migrate()).toEqual({ migrated: 2, current: 0, failed: 1 });
    expect(fs.readFileSync(gmailStorePath).equals(damaged)).toBe(true);

    const oauth = new OAuth2Handler({ vault: t.vault, filePath: gmailStorePath });
    expect(oauth.getAuthStatus()).toEqual({ isAuthorized: false, secretState: 'unreadable' });
    expect(oauth.getCredentialStatus()).toBeNull();
    expect(fs.readFileSync(gmailStorePath).equals(damaged)).toBe(true); // reads never rewrite

    oauth.setCredentials({ clientId: 'id', clientSecret: 'entered-again' });
    const kept = fs
      .readdirSync(t.userDataDir)
      .filter((f) => f.startsWith('gmail-oauth.json.corrupt-'));
    expect(kept).toHaveLength(1);
    expect(fs.readFileSync(path.join(t.userDataDir, kept[0])).equals(damaged)).toBe(true);
    expect(oauth.getCredentialStatus()).toEqual({ clientId: 'id', hasClientSecret: true });
  });
});

describe('the app on a fixture database (container + IPC)', () => {
  let db: Database.Database;
  let container: AppContainer | null;
  let userDataDir: string;
  let ipc: FakeIpcMain;

  const call = <T = unknown>(channel: string, payload?: unknown): Promise<APIResponse<T>> =>
    ipc.invoke(channel, fakeEvent(), payload) as Promise<APIResponse<T>>;

  /** Starts the app the way index.ts does (the container runs the secret migration). */
  function start(): AppContainer {
    const started = createContainer({
      db,
      logsDir: TEST_LOGS_DIR,
      ...containerSecrets(new FakeSafeStorage(), userDataDir),
    });
    started.profile.ensureLocalProfile();
    ipc = new FakeIpcMain();
    registerIpcHandlers(started, { isTrustedSender: () => true, ipc });
    container = started;
    return started;
  }

  /** The database file of `loadFixture`, reopened by `openDatabase` (WAL, migrations). */
  function openFixtureFile(name: FixtureName): Database.Database {
    const fixtureDb = loadFixture(name);
    const file = fixtureDb.name;
    fixtureDb.close();
    return openDatabase(file);
  }

  beforeEach(() => {
    mockSmtp.connections = 0;
    mockSmtp.sent = 0;
    container = null;
    db = openFixtureFile('v5-release-1.2.0');
    userDataDir = path.dirname(db.name);
    writeLegacyGmailStore(userDataDir);
  });

  afterEach(() => {
    if (container) container.dispose();
    disposeFixture(db);
  });

  it('wrong machine id: notifiers.get is unreadable/error, the dispatcher never sends, logs hold no secret, and the rows are never overwritten until a user save', async () => {
    mockMachineId = 'another-machine';
    const usersBefore = rows(db, 'users');
    const notifiersBefore = rows(db, 'notifiers');

    const { logs } = await captureLogs(async () => {
      const app = start();
      const send = jest.spyOn(
        app.notifierDispatcher.getNotifier(NotifierChannel.EMAIL_SMTP)!,
        'send'
      );

      const notifier = await call<Record<string, unknown>>('notifiers:get', {
        channel: NotifierChannel.EMAIL_SMTP,
      });
      expect(notifier).toMatchObject({
        success: true,
        data: {
          secretState: 'unreadable',
          status: NotifierStatus.ERROR,
          lastError: 'Saved password could not be decrypted; re-enter it',
          hasPassword: false,
          enabled: true,
        },
      });
      await expect(call('auth:get-credentials')).resolves.toEqual({
        success: true,
        data: { email: 'fixture.user@example.com', hasPassword: false, secretState: 'unreadable' },
      });

      // Two notifications: neither is sent through the unreadable notifier
      for (const title of ['Availability found', 'Another one']) {
        const results = await app.notifierDispatcher.dispatch({ title, message: 'Site 12' });
        expect(results).toEqual([
          {
            channel: NotifierChannel.EMAIL_SMTP,
            result: { success: false, error: 'Saved password could not be decrypted; re-enter it' },
          },
        ]);
      }
      expect(send).not.toHaveBeenCalled();
      await expect(
        call('notifiers:test', { channel: NotifierChannel.EMAIL_SMTP })
      ).resolves.toMatchObject({ success: true, data: { success: false } });
      expect(mockSmtp).toEqual({ connections: 0, sent: 0 });

      // Reads, a restart (the migration runs again) and an enable never overwrite them
      app.dispose();
      db = openDatabase(db.name);
      start();
      await call('notifiers:enable', { channel: NotifierChannel.EMAIL_SMTP });
      expect(rows(db, 'users')).toEqual(usersBefore);
      expect(rows(db, 'notifiers')).toEqual(notifiersBefore);
    });

    expect(
      logs.match(/Skipping notifier email_smtp: its saved settings could not be decrypted/g)
    ).toHaveLength(1);
    for (const value of [
      ...LEGACY_PLAINTEXTS,
      usersBefore[0].encrypted_password as string,
      notifiersBefore[0].config as string,
    ]) {
      expect(logs).not.toContain(value);
    }

    // The user enters the password again: now it is stored, readable and used
    await call('notifiers:configure', {
      channel: NotifierChannel.EMAIL_SMTP,
      displayName: 'Email (SMTP)',
      enabled: true,
      config: {
        ...FIXTURE_NOTIFIER_CONFIG,
        preset: SMTPPreset.GMAIL,
        auth: { user: 'fixture.user@example.com', pass: 'entered-again' },
      },
    });
    expect(rows(db, 'notifiers')[0].config).toMatch(/^vault:v1:os:/);
    await expect(
      call('notifiers:get', { channel: NotifierChannel.EMAIL_SMTP })
    ).resolves.toMatchObject({ data: { secretState: 'ok', hasPassword: true } });
    await container!.notifierDispatcher.dispatch({ title: 'Now sent', message: 'Site 12' });
    expect(mockSmtp.sent).toBe(1);
  });

  it('after saving secrets, a byte scan of the database, its WAL and gmail-oauth.json finds no plaintext', async () => {
    mockMachineId = FIXTURE_MACHINE_ID;
    start(); // migrates the fixture's and the Gmail store's legacy secrets

    const saved = {
      parkstay: 'Scan-ParkStay-Passw0rd!',
      smtp: 'scan-smtp-app-password',
      clientSecret: 'GOCSPX-scan-client-secret',
    };
    const responses = [
      await call('auth:store-credentials', { email: 'scan@example.com', password: saved.parkstay }),
      await call('notifiers:configure', {
        channel: NotifierChannel.EMAIL_SMTP,
        displayName: 'Email (SMTP)',
        enabled: true,
        config: {
          ...FIXTURE_NOTIFIER_CONFIG,
          preset: SMTPPreset.GMAIL,
          auth: { user: 'scan@example.com', pass: saved.smtp },
        },
      }),
      await call('gmail:set-credentials', {
        clientId: 'scan-client',
        clientSecret: saved.clientSecret,
      }),
    ];
    expect(responses.every((r) => r.success)).toBe(true);

    const files = [
      db.name,
      `${db.name}-wal`,
      `${db.name}-shm`,
      path.join(userDataDir, 'gmail-oauth.json'),
    ];
    expect(fs.existsSync(`${db.name}-wal`)).toBe(true);
    const scan = (): string[] =>
      files
        .filter((file) => fs.existsSync(file))
        .flatMap((file) => {
          const bytes = fs.readFileSync(file);
          return [...LEGACY_PLAINTEXTS, ...Object.values(saved)]
            .filter((plaintext) => bytes.includes(Buffer.from(plaintext, 'utf8')))
            .map((plaintext) => `${path.basename(file)}: ${plaintext}`);
        });

    expect(scan()).toEqual([]);
    // And once the WAL is checkpointed into the main file
    db.pragma('wal_checkpoint(TRUNCATE)');
    expect(scan()).toEqual([]);

    // Still readable by the app
    await expect(container!.authService.getCredentials()).resolves.toEqual({
      email: 'scan@example.com',
      password: saved.parkstay,
    });
  });
});
