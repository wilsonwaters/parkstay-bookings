/**
 * Architecture-notes §12.21 and §12.22: the local profile row (`users` id 1) must always
 * exist and nothing may delete it. Every watch, booking, snipe and notification has
 * `user_id ... ON DELETE CASCADE`, so deleting the row wipes all of the user's data.
 *
 * `AuthService.deleteCredentials` (Logout) clears only the credential fields (P3), and
 * startup creates the profile row when the table is empty (`ensureLocalProfile`).
 */

import Database from 'better-sqlite3';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository, WatchRepository } from '@main/database/repositories';
import { AuthService } from '@main/services/auth/AuthService';
import { createLocalProfile } from '@main/app/profile';
import { mockUserInput } from '@tests/fixtures/users';
import { createMockWatchInput } from '@tests/fixtures/watches';

jest.mock('node-machine-id', () => ({ machineIdSync: () => 'test-machine-id' }));

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
    const auth = new AuthService(users);
    const profile = await auth.storeCredentials(mockUserInput);
    const watch = new WatchRepository(db).create(profile.id, createMockWatchInput());

    await auth.deleteCredentials();

    expect(users.findById(profile.id)).not.toBeNull();
    expect(new WatchRepository(db).findById(watch.id)).not.toBeNull();
  });

  test('is created at startup on a fresh install, as id 1 with blank credentials', () => {
    const users = new UserRepository(db);
    expect(users.findAll()).toHaveLength(0);

    expect(createLocalProfile(users).ensureLocalProfile()).toBe(1);

    expect(users.findAll()).toEqual([
      expect.objectContaining({ id: 1, email: '', encryptedPassword: '' }),
    ]);
    expect(new AuthService(users).hasStoredCredentials()).toBe(false);
  });

  test('a fresh-install profile survives sign-in and Logout with its data', async () => {
    const users = new UserRepository(db);
    const userId = createLocalProfile(users).ensureLocalProfile();
    const auth = new AuthService(users);
    const watch = new WatchRepository(db).create(userId, createMockWatchInput());

    await auth.storeCredentials(mockUserInput);
    await auth.deleteCredentials();

    expect(users.findAll().map((u) => u.id)).toEqual([userId]);
    expect(new WatchRepository(db).findById(watch.id)).not.toBeNull();
  });
});
