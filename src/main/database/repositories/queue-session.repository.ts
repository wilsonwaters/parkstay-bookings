import { QueueSession, QueueStatus } from '@shared/types';
import { BaseRepository } from './base.repository';

/** `queue_session` is a singleton table: the DBCA queue session always lives in row 1. */
const SESSION_ROW_ID = 1;

interface QueueSessionRow {
  id: number;
  session_key: string;
  status: string | null;
  position: number | null;
  estimated_wait_seconds: number | null;
  expiry_seconds: number | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * Persists the DBCA queue session so the queue position survives restarts.
 */
export class QueueSessionRepository extends BaseRepository<QueueSession> {
  protected readonly tableName = 'queue_session';

  /** The stored session, expired or not, or null when none is stored. */
  get(): QueueSession | null {
    return this.findById(SESSION_ROW_ID);
  }

  /** Stores the session, replacing any previous one. `updated_at` records the save time. */
  save(session: QueueSession): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO queue_session
         (id, session_key, status, position, estimated_wait_seconds, expiry_seconds, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        SESSION_ROW_ID,
        session.sessionKey,
        session.status,
        session.position,
        session.estimatedWaitSeconds,
        session.expirySeconds,
        session.expiresAt.toISOString(),
        session.createdAt.toISOString(),
        new Date().toISOString()
      );
  }

  /** Removes the stored session. */
  clear(): void {
    this.deleteById(SESSION_ROW_ID);
  }

  protected mapRow(row: QueueSessionRow): QueueSession {
    return {
      sessionKey: row.session_key,
      status: row.status as QueueStatus,
      position: row.position || 0,
      estimatedWaitSeconds: row.estimated_wait_seconds || 0,
      expirySeconds: row.expiry_seconds || 0,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
      lastCheckedAt: new Date(row.updated_at),
    };
  }
}
