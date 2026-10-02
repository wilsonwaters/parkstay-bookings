/**
 * QueueSessionRepository against a real migrated database.
 */

import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { QueueSessionRepository } from '@main/database/repositories';
import { QueueSession } from '@shared/types';

describe('QueueSessionRepository', () => {
  let dbHelper: TestDatabaseHelper;
  let repo: QueueSessionRepository;

  const session: QueueSession = {
    sessionKey: 'KEY1234567890123456789012345678901234567890123456789',
    status: 'Waiting',
    position: 42,
    estimatedWaitSeconds: 300,
    expirySeconds: 600,
    createdAt: new Date('2026-01-19T15:50:00.000Z'),
    expiresAt: new Date('2026-01-19T16:00:00.000Z'),
    lastCheckedAt: new Date('2026-01-19T15:55:00.000Z'),
  };

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('queue-session-repo');
    repo = new QueueSessionRepository(await dbHelper.setup());
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  it('returns null when no session is stored', () => {
    expect(repo.get()).toBeNull();
  });

  it('saves and restores the singleton session, replacing any previous one', () => {
    repo.save({ ...session, sessionKey: 'OLD', position: 99 });
    repo.save(session);

    const stored = repo.get();
    expect(stored).toMatchObject({
      sessionKey: session.sessionKey,
      status: 'Waiting',
      position: 42,
      estimatedWaitSeconds: 300,
      expirySeconds: 600,
    });
    expect(stored?.createdAt.toISOString()).toBe(session.createdAt.toISOString());
    expect(stored?.expiresAt.toISOString()).toBe(session.expiresAt.toISOString());
    expect(dbHelper.getDb().prepare('SELECT COUNT(*) AS n FROM queue_session').get()).toEqual({
      n: 1,
    });
  });

  it('clear removes the stored session', () => {
    repo.save(session);
    repo.clear();

    expect(repo.get()).toBeNull();
  });
});
