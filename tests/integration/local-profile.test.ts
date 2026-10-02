/**
 * Architecture-notes §12.21 and §12.22: the local profile row (`users` id 1) must always
 * exist and nothing may delete it. Every watch, booking, snipe and notification has
 * `user_id ... ON DELETE CASCADE`, so deleting the row wipes all of the user's data.
 *
 * HOOK FOR P3: `AuthService.deleteCredentials` (Logout) still deletes the row through
 * `UserRepository.deleteById`, so this test is marked `test.failing`. P3 makes credential
 * deletion clear only the credential fields; at that point this test starts to "fail" and
 * must be switched to a plain `test`.
 */

import Database from 'better-sqlite3';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository, WatchRepository } from '@main/database/repositories';
import { AuthService } from '@main/services/auth/AuthService';
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

  test.failing('survives credential deletion (Logout), together with its data', async () => {
    const users = new UserRepository(db);
    const auth = new AuthService(users);
    const profile = await auth.storeCredentials(mockUserInput);
    const watch = new WatchRepository(db).create(profile.id, createMockWatchInput());

    await auth.deleteCredentials();

    expect(users.findById(profile.id)).not.toBeNull();
    expect(new WatchRepository(db).findById(watch.id)).not.toBeNull();
  });
});
