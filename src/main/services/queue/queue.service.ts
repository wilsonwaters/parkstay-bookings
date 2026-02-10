/**
 * Queue Service
 *
 * Manages the DBCA ParkStay queue system (queue.dbca.wa.gov.au).
 * This service:
 * 1. Checks/creates queue sessions via the queue API
 * 2. Polls queue status until session becomes active
 * 3. Persists session to database to maintain position across restarts
 * 4. Emits events for UI updates
 * 5. Provides the session cookie for ParkStay API requests
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { getDatabase } from '../../database/connection';
import {
  QueueSession,
  QueueAPIResponse,
  QueueStatus,
  QueueServiceConfig,
  QueueStatusEvent,
  QueueWaitResult,
} from '@shared/types';
import {
  QUEUE_API_BASE_URL,
  QUEUE_GROUP,
  QUEUE_POLL_INTERVAL_MS,
  QUEUE_SESSION_REFRESH_BUFFER_MS,
  QUEUE_MAX_RETRIES,
  QUEUE_RETRY_DELAY_MS,
} from '@shared/constants';
import { getQueueApiHeaders } from '../../utils/browser-headers';

const DEFAULT_CONFIG: QueueServiceConfig = {
  pollIntervalMs: QUEUE_POLL_INTERVAL_MS,
  sessionRefreshBufferMs: QUEUE_SESSION_REFRESH_BUFFER_MS,
  maxRetries: QUEUE_MAX_RETRIES,
  retryDelayMs: QUEUE_RETRY_DELAY_MS,
};

export class QueueService extends EventEmitter {
  private client: AxiosInstance;
  private session: QueueSession | null = null;
  private config: QueueServiceConfig;
  private pollTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isWaiting: boolean = false;
  private waitPromise: Promise<QueueWaitResult> | null = null;

  constructor(config: Partial<QueueServiceConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.client = axios.create({
      baseURL: QUEUE_API_BASE_URL,
      timeout: 30000,
      headers: getQueueApiHeaders(),
    });

    // Load persisted session on startup
    this.loadSessionFromDatabase();
  }

  /**
   * Load session from database if exists
   */
  private loadSessionFromDatabase(): void {
    try {
      const db = getDatabase();
      const row = db
        .prepare(
          `SELECT session_key, status, position, estimated_wait_seconds,
                  expiry_seconds, expires_at, created_at, updated_at
           FROM queue_session WHERE id = 1`
        )
        .get() as any;

      if (row && row.session_key) {
        const expiresAt = new Date(row.expires_at);

        // Only restore if not expired
        if (expiresAt > new Date()) {
          this.session = {
            sessionKey: row.session_key,
            status: row.status as QueueStatus,
            position: row.position || 0,
            estimatedWaitSeconds: row.estimated_wait_seconds || 0,
            expirySeconds: row.expiry_seconds || 0,
            createdAt: new Date(row.created_at),
            expiresAt,
            lastCheckedAt: new Date(row.updated_at),
          };
          console.log('Restored queue session from database:', this.session.sessionKey);

          // Schedule refresh for restored session
          this.scheduleSessionRefresh();
        } else {
          console.log('Stored queue session has expired, will create new one');
          this.clearSessionFromDatabase();
        }
      }
    } catch (error) {
      console.error('Failed to load queue session from database:', error);
    }
  }

  /**
   * Save session to database
   */
  private saveSessionToDatabase(): void {
    if (!this.session) return;

    try {
      const db = getDatabase();
      db.prepare(
        `INSERT OR REPLACE INTO queue_session
         (id, session_key, status, position, estimated_wait_seconds, expiry_seconds, expires_at, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        this.session.sessionKey,
        this.session.status,
        this.session.position,
        this.session.estimatedWaitSeconds,
        this.session.expirySeconds,
        this.session.expiresAt.toISOString(),
        this.session.createdAt.toISOString(),
        new Date().toISOString()
      );
    } catch (error) {
      console.error('Failed to save queue session to database:', error);
    }
  }

  /**
   * Clear session from database
   */
  private clearSessionFromDatabase(): void {
    try {
      const db = getDatabase();
      db.prepare('DELETE FROM queue_session WHERE id = 1').run();
    } catch (error) {
      console.error('Failed to clear queue session from database:', error);
    }
  }

  /**
   * Generate a new session key
   */
  private generateSessionKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 52; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  }

  /**
   * Get the session key (existing or generate new)
   */
  private getSessionKey(): string {
    if (this.session?.sessionKey) {
      return this.session.sessionKey;
    }
    return this.generateSessionKey();
  }

  /**
   * Check queue status or create a new session
   */
  async checkOrCreateSession(sessionKey?: string): Promise<QueueSession> {
    const key = sessionKey || this.getSessionKey();

    try {
      const response = await this.client.get<QueueAPIResponse>('/api/check-create-session/', {
        params: {
          session_key: key,
          queue_group: QUEUE_GROUP,
        },
      });

      const now = new Date();
      const expiresAt = new Date(now.getTime() + response.data.expiry_seconds * 1000);

      this.session = {
        sessionKey: response.data.session_key,
        status: response.data.status,
        position: response.data.queue_position,
        estimatedWaitSeconds: response.data.wait_time,
        expirySeconds: response.data.expiry_seconds,
        createdAt: this.session?.createdAt || now,
        expiresAt,
        lastCheckedAt: now,
      };

      // Persist to database
      this.saveSessionToDatabase();

      // Emit status event
      this.emitStatusEvent('status_changed', this.session);

      // Schedule session refresh before expiry
      this.scheduleSessionRefresh();

      return this.session;
    } catch (error: any) {
      console.error('Queue check failed:', error.message);
      this.emitStatusEvent('error', undefined, error.message);
      throw new Error(`Failed to check queue: ${error.message}`);
    }
  }

  /**
   * Wait in queue until status becomes 'Active'
   * Returns when active (waits indefinitely as per user preference)
   */
  async waitForActive(sessionKey?: string): Promise<QueueWaitResult> {
    // If already waiting, return existing promise to prevent concurrent waits
    if (this.waitPromise) {
      return this.waitPromise;
    }

    this.waitPromise = this.doWaitForActive(sessionKey);

    try {
      return await this.waitPromise;
    } finally {
      this.waitPromise = null;
    }
  }

  private async doWaitForActive(sessionKey?: string): Promise<QueueWaitResult> {
    if (this.isWaiting) {
      return { success: false, error: 'Already waiting in queue' };
    }

    this.isWaiting = true;

    try {
      // Initial check
      const session = await this.checkOrCreateSession(sessionKey);

      // If already active, return immediately
      if (session.status === 'Active') {
        this.emitStatusEvent('session_active', session);
        return { success: true, session };
      }

      // Poll until active (indefinitely)
      return await this.pollUntilActive();
    } catch (error: any) {
      return { success: false, error: error.message };
    } finally {
      this.isWaiting = false;
      this.stopPolling();
    }
  }

  /**
   * Poll queue status until active
   */
  private async pollUntilActive(): Promise<QueueWaitResult> {
    return new Promise((resolve) => {
      const poll = async () => {
        try {
          const session = await this.checkOrCreateSession(this.session?.sessionKey);

          if (session.status === 'Active') {
            this.emitStatusEvent('session_active', session);
            resolve({ success: true, session });
            return;
          }

          // Emit position update
          this.emitStatusEvent('position_update', session);

          // Schedule next poll
          this.pollTimer = setTimeout(poll, this.config.pollIntervalMs);
        } catch (error: any) {
          // Retry on error
          console.warn('Queue poll error, retrying:', error.message);
          this.pollTimer = setTimeout(poll, this.config.retryDelayMs);
        }
      };

      // Start first poll
      this.pollTimer = setTimeout(poll, this.config.pollIntervalMs);
    });
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Schedule session refresh before expiry
   */
  private scheduleSessionRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.session) return;

    const refreshTime =
      this.session.expiresAt.getTime() - Date.now() - this.config.sessionRefreshBufferMs;

    if (refreshTime > 0) {
      this.refreshTimer = setTimeout(async () => {
        try {
          await this.checkOrCreateSession(this.session?.sessionKey);
          console.log('Queue session refreshed');
        } catch (error) {
          console.error('Failed to refresh queue session:', error);
          this.emitStatusEvent('session_expired', this.session!);
        }
      }, refreshTime);
    }
  }

  /**
   * Emit a status event
   */
  private emitStatusEvent(
    type: QueueStatusEvent['type'],
    session?: QueueSession,
    error?: string
  ): void {
    const event: QueueStatusEvent = { type, session, error };
    this.emit('status', event);
    this.emit(type, event);
  }

  /**
   * Get current session
   */
  getSession(): QueueSession | null {
    return this.session;
  }

  /**
   * Get session cookie value for use in ParkStay requests
   */
  getSessionCookie(): string | null {
    return this.session?.sessionKey || null;
  }

  /**
   * Check if session is active and not expired
   */
  isSessionActive(): boolean {
    if (!this.session) return false;
    if (this.session.status !== 'Active') return false;
    if (new Date() >= this.session.expiresAt) return false;
    return true;
  }

  /**
   * Check if session is expired
   */
  isSessionExpired(): boolean {
    if (!this.session) return true;
    return new Date() >= this.session.expiresAt;
  }

  /**
   * Check if currently waiting in queue
   */
  isWaitingInQueue(): boolean {
    return this.isWaiting;
  }

  /**
   * Clear session
   */
  clearSession(): void {
    this.session = null;
    this.stopPolling();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.clearSessionFromDatabase();
  }

  /**
   * Get estimated wait time in human-readable format
   */
  getEstimatedWaitFormatted(): string {
    if (!this.session) return 'Unknown';
    const seconds = this.session.estimatedWaitSeconds;
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }

  /**
   * Get session expiry time remaining in human-readable format
   */
  getExpiryTimeRemaining(): string {
    if (!this.session) return 'No session';
    const remaining = this.session.expiresAt.getTime() - Date.now();
    if (remaining <= 0) return 'Expired';
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    this.stopPolling();
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.removeAllListeners();
  }
}
