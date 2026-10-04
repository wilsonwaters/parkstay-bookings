/**
 * Architecture-notes §12.21 and §12.22: the local profile row (`users` id 1) must always
 * exist and nothing may delete it. Every watch, booking, snipe and notification has
 * `user_id ... ON DELETE CASCADE`, so deleting the row wipes all of the user's data.
 *
 * Migration v8 seeds the profile row with no credentials (platform open question 1),
 * `AuthService.deleteCredentials` (Logout) clears only the credential fields (P3), and
 * startup creates the profile row when the table is empty (`ensureLocalProfile`).
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository, WatchRepository } from '@main/database/repositories';
import { AuthService } from '@main/services/auth/AuthService';
import { createLocalProfile } from '@main/app/profile';
import { mockUserInput } from '@tests/fixtures/users';
import { createMockWatchInput } from '@tests/fixtures/watches';
import { testVault } from '@tests/utils/fake-safe-storage';

const { vault } = testVault();

describe('local profile row', () => {
  let dbHelper: TestDatabaseHelper;
  let db: Database.Database;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('local-profile');
    db = await dbHelper.setup();
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  test('survives credential deletion (Logout), together with its data', async () => {
    const users = new UserRepository(db);
    const auth = new AuthService(users, vault);
    const profile = await auth.storeCredentials(mockUserInput);
    const watch = new WatchRepository(db).create(profile.id, createMockWatchInput());

    await auth.deleteCredentials();

    expect(users.findById(profile.id)).not.toBeNull();
    expect(new WatchRepository(db).findById(watch.id)).not.toBeNull();
  });

  test('exists on a fresh install, as id 1 with NULL credentials, and startup keeps it', () => {
    const users = new UserRepository(db);
    expect(db.prepare('SELECT * FROM users').all()).toEqual([
      expect.objectContaining({
        id: 1,
        email: null,
        encrypted_password: null,
        encryption_key: null,
        encryption_iv: null,
        encryption_auth_tag: null,
      }),
    ]);

    expect(createLocalProfile(users).ensureLocalProfile()).toBe(1);

    expect(users.findAll()).toEqual([
      expect.objectContaining({ id: 1, email: '', encryptedPassword: '' }),
    ]);
    const auth = new AuthService(users, vault);
    expect(auth.hasStoredCredentials()).toBe(false);
    expect(auth.getCredentialStatus()).toBeNull();
  });

  test('a NULL-email profile takes credentials on sign-in and clears them back to NULL', async () => {
    const users = new UserRepository(db);
    const auth = new AuthService(users, vault);

    const signedIn = await auth.storeCredentials(mockUserInput);
    expect(signedIn.id).toBe(1);
    expect(auth.getCredentialStatus()).toMatchObject({
      email: mockUserInput.email,
      hasPassword: true,
    });

    await auth.deleteCredentials();
    expect(db.prepare('SELECT id, email, encrypted_password FROM users').all()).toEqual([
      { id: 1, email: null, encrypted_password: null },
    ]);
    expect(auth.getCredentialStatus()).toBeNull();
  });

  test('no main-process code deletes users rows (§12.22)', () => {
    const offenders: string[] = [];
    const visit = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.ts$/.test(entry.name)) {
          const source = fs.readFileSync(file, 'utf8');
          if (
            /DELETE\s+FROM\s+["'`]?users\b/i.test(source) ||
            /\busers?(?:Repo(?:sitory)?)?\s*\.\s*deleteById\s*\(/i.test(source)
          ) {
            offenders.push(path.relative(process.cwd(), file));
          }
        }
      }
    };
    visit(path.resolve(__dirname, '../../src/main'));

    expect(offenders).toEqual([]);
  });

  test('a fresh-install profile survives sign-in and Logout with its data', async () => {
    const users = new UserRepository(db);
    const userId = createLocalProfile(users).ensureLocalProfile();
    const auth = new AuthService(users, vault);
    const watch = new WatchRepository(db).create(userId, createMockWatchInput());

    await auth.storeCredentials(mockUserInput);
    await auth.deleteCredentials();

    expect(users.findAll().map((u) => u.id)).toEqual([userId]);
    expect(new WatchRepository(db).findById(watch.id)).not.toBeNull();
  });
});
