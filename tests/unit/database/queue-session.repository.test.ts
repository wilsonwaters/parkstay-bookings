/**
 * QueueSessionRepository against a real migrated database. Since v8 the session is the
 * `('parkstay', 'queue.session')` entry of `provider_state`, in the JSON shape agreed with V3.
 */

import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { ProviderStateRepository, QueueSessionRepository } from '@main/database/repositories';
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
    repo = new QueueSessionRepository(new ProviderStateRepository(await dbHelper.setup()));
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
    expect(stored?.lastCheckedAt).toBeInstanceOf(Date);

    const rows = dbHelper
      .getDb()
      .prepare('SELECT provider_id, key, value FROM provider_state')
      .all() as { provider_id: string; key: string; value: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider_id: 'parkstay', key: 'queue.session' });
    expect(JSON.parse(rows[0].value)).toEqual({
      sessionKey: session.sessionKey,
      status: 'Waiting',
      position: 42,
      estimatedWaitSeconds: 300,
      expirySeconds: 600,
      expiresAt: '2026-01-19T16:00:00.000Z',
      createdAt: '2026-01-19T15:50:00.000Z',
    });
  });

  it('clear removes the stored session', () => {
    repo.save(session);
    repo.clear();

    expect(repo.get()).toBeNull();
  });
});
