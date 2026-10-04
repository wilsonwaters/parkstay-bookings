import { QueueSession, QueueStatus } from '@shared/types';
import { ProviderStateRepository } from './provider-state.repository';

/** Where the DBCA queue session lives in `provider_state` (agreed with V3). */
export const QUEUE_SESSION_PROVIDER = 'parkstay';
export const QUEUE_SESSION_KEY = 'queue.session';

/** The JSON stored under `('parkstay', 'queue.session')`. Migration v8 writes the same shape. */
export interface StoredQueueSession {
  sessionKey: string;
  status: string | null;
  position: number | null;
  estimatedWaitSeconds: number | null;
  expirySeconds: number | null;
  /** ISO instant. */
  expiresAt: string | null;
  /** ISO instant. */
  createdAt: string | null;
}

/**
 * Persists the DBCA queue session so the queue position survives restarts. Since v8 it is
 * a `provider_state` entry rather than the `queue_session` table; V3 replaces this
 * repository with the ParkStay provider's own state.
 */
export class QueueSessionRepository {
  constructor(private readonly state: ProviderStateRepository) {}

  /** The stored session, expired or not, or null when none is stored. */
  get(): QueueSession | null {
    const entry = this.state.getEntry<StoredQueueSession>(
      QUEUE_SESSION_PROVIDER,
      QUEUE_SESSION_KEY
    );
    if (!entry) return null;
    const stored = entry.value;
    return {
      sessionKey: stored.sessionKey,
      status: (stored.status ?? 'Unknown') as QueueStatus,
      position: stored.position || 0,
      estimatedWaitSeconds: stored.estimatedWaitSeconds || 0,
      expirySeconds: stored.expirySeconds || 0,
      createdAt: new Date(stored.createdAt ?? 0),
      expiresAt: new Date(stored.expiresAt ?? 0),
      lastCheckedAt: entry.updatedAt,
    };
  }

  /** Stores the session, replacing any previous one. The entry's update time records the save time. */
  save(session: QueueSession): void {
    const stored: StoredQueueSession = {
      sessionKey: session.sessionKey,
      status: session.status,
      position: session.position,
      estimatedWaitSeconds: session.estimatedWaitSeconds,
      expirySeconds: session.expirySeconds,
      expiresAt: session.expiresAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
    };
    this.state.set(QUEUE_SESSION_PROVIDER, QUEUE_SESSION_KEY, stored);
  }

  /** Removes the stored session. */
  clear(): void {
    this.state.delete(QUEUE_SESSION_PROVIDER, QUEUE_SESSION_KEY);
  }
}
