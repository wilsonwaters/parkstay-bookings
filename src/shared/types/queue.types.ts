/**
 * Queue types for DBCA ParkStay queue system
 */

/**
 * Queue status from the DBCA queue API
 */
export type QueueStatus = 'Active' | 'Waiting' | 'Unknown';

/**
 * Raw response from queue.dbca.wa.gov.au API
 */
export interface QueueAPIResponse {
  status: 'Active' | 'Waiting';
  session_key: string;
  queue_position: number;
  wait_time: number;
  expiry_seconds: number;
  time_left_enabled?: boolean;
  show_queue_position?: boolean;
  browser_inactivity_timeout?: number;
  browser_inactivity_redirect?: string;
  browser_inactivity_enabled?: boolean;
  waiting_queue_enabled?: boolean;
  custom_message?: string;
  queue_name?: string;
  more_info_link?: string;
  max_queue_session_limit?: string;
  max_queue_url_redirect?: string;
  queue_waiting_room_url?: string;
  queue_inactivity_url?: string;
  url?: string;
  refresh_page?: boolean;
}

/**
 * Queue session info with expiry tracking
 */
export interface QueueSession {
  sessionKey: string;
  status: QueueStatus;
  position: number;
  estimatedWaitSeconds: number;
  expirySeconds: number;
  createdAt: Date;
  expiresAt: Date;
  lastCheckedAt: Date;
}

/**
 * Queue session stored in database
 */
export interface QueueSessionRecord {
  id?: number;
  sessionKey: string;
  status: QueueStatus;
  expiresAt: string;
  updatedAt: string;
}

/**
 * Queue service events for UI updates
 */
export interface QueueStatusEvent {
  type: 'status_changed' | 'position_update' | 'session_active' | 'session_expired' | 'error';
  session?: QueueSession;
  error?: string;
}

/**
 * Queue service configuration
 */
export interface QueueServiceConfig {
  pollIntervalMs: number;
  sessionRefreshBufferMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Result of waiting in queue
 */
export interface QueueWaitResult {
  success: boolean;
  session?: QueueSession;
  error?: string;
}
