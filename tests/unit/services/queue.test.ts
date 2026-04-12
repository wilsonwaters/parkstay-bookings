/**
 * QueueService Unit Tests
 *
 * Tests the DBCA ParkStay queue system handling including:
 * - Session creation and management
 * - Polling until active
 * - Database persistence
 * - Session expiry and refresh
 * - Event emission
 * - Queue wait delays
 */

import { QueueAPIResponse } from '@shared/types';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock the database module so we don't need the native better-sqlite3 binary
const mockDbPrepare = jest.fn();
const mockDb = {
  prepare: mockDbPrepare,
};
jest.mock('@main/database/connection', () => ({
  getDatabase: () => mockDb,
}));

// Import after mocks are set up
import { QueueService } from '@main/services/queue/queue.service';

// Helper: build a queue API response
function mockQueueApiResponse(overrides: Partial<QueueAPIResponse> = {}): QueueAPIResponse {
  return {
    status: 'Active',
    session_key: 'TESTKEY1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    queue_position: 0,
    wait_time: 0,
    expiry_seconds: 600,
    ...overrides,
  };
}

describe('QueueService', () => {
  let mockAxiosInstance: {
    get: jest.Mock;
    interceptors: { request: { use: jest.Mock }; response: { use: jest.Mock } };
  };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Create a mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    // Default: database has no stored session
    mockDbPrepare.mockReturnValue({
      get: jest.fn().mockReturnValue(null),
      run: jest.fn(),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('checkOrCreateSession', () => {
    it('should create a session and return it when API responds Active', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active', queue_position: 0 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      const session = await service.checkOrCreateSession();

      expect(session).toBeDefined();
      expect(session.sessionKey).toBe(apiResponse.session_key);
      expect(session.status).toBe('Active');
      expect(session.position).toBe(0);
      expect(session.expirySeconds).toBe(600);
      expect(session.expiresAt).toBeInstanceOf(Date);
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());

      service.destroy();
    });

    it('should create a session with Waiting status and queue position', async () => {
      const apiResponse = mockQueueApiResponse({
        status: 'Waiting',
        queue_position: 42,
        wait_time: 120,
      });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      const session = await service.checkOrCreateSession();

      expect(session.status).toBe('Waiting');
      expect(session.position).toBe(42);
      expect(session.estimatedWaitSeconds).toBe(120);

      service.destroy();
    });

    it('should call queue API with correct params', async () => {
      const apiResponse = mockQueueApiResponse();
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/check-create-session/', {
        params: {
          session_key: expect.any(String),
          queue_group: 'parkstayv2',
        },
      });

      service.destroy();
    });

    it('should use provided session key instead of generating one', async () => {
      const customKey = 'CUSTOMKEY123456789012345678901234567890123456789012';
      const apiResponse = mockQueueApiResponse({ session_key: customKey });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession(customKey);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/check-create-session/', {
        params: {
          session_key: customKey,
          queue_group: 'parkstayv2',
        },
      });

      service.destroy();
    });

    it('should throw an error when the queue API fails', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      const service = new QueueService();
      // Must listen for 'error' event to prevent Node unhandled error
      service.on('error', () => {});
      await expect(service.checkOrCreateSession()).rejects.toThrow(
        'Failed to check queue: Network error'
      );

      service.destroy();
    });

    it('should emit status_changed event', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      const statusHandler = jest.fn();
      service.on('status_changed', statusHandler);

      await service.checkOrCreateSession();

      expect(statusHandler).toHaveBeenCalledTimes(1);
      expect(statusHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'status_changed',
          session: expect.objectContaining({ status: 'Active' }),
        })
      );

      service.destroy();
    });

    it('should emit error event when API fails', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));

      const service = new QueueService();
      const errorHandler = jest.fn();
      service.on('error', errorHandler);

      await expect(service.checkOrCreateSession()).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          error: 'Connection refused',
        })
      );

      service.destroy();
    });

    it('should persist session to database', async () => {
      const mockRun = jest.fn();
      mockDbPrepare.mockReturnValue({ get: jest.fn().mockReturnValue(null), run: mockRun });

      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      // Should have called prepare with INSERT OR REPLACE for queue_session
      const insertCalls = mockDbPrepare.mock.calls.filter(
        (call: string[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT OR REPLACE INTO queue_session')
      );
      expect(insertCalls.length).toBeGreaterThan(0);
      expect(mockRun).toHaveBeenCalled();

      service.destroy();
    });
  });

  describe('session state checks', () => {
    it('isSessionActive returns true for active non-expired session', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active', expiry_seconds: 600 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      expect(service.isSessionActive()).toBe(true);
      expect(service.isSessionExpired()).toBe(false);

      service.destroy();
    });

    it('isSessionActive returns false for Waiting status', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Waiting' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      expect(service.isSessionActive()).toBe(false);

      service.destroy();
    });

    it('isSessionActive returns false when no session exists', () => {
      const service = new QueueService();

      expect(service.isSessionActive()).toBe(false);
      expect(service.isSessionExpired()).toBe(true);

      service.destroy();
    });

    it('getSessionCookie returns session key', async () => {
      const apiResponse = mockQueueApiResponse();
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      expect(service.getSessionCookie()).toBe(apiResponse.session_key);

      service.destroy();
    });

    it('getSessionCookie returns null when no session', () => {
      const service = new QueueService();
      expect(service.getSessionCookie()).toBeNull();
      service.destroy();
    });
  });

  describe('waitForActive', () => {
    it('should return immediately if session is already Active', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      const result = await service.waitForActive();

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session!.status).toBe('Active');
      // Only one API call (initial check), no polling needed
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);

      service.destroy();
    });

    it('should poll until session becomes Active (simulates queue delay)', async () => {
      jest.useFakeTimers();

      // First call: Waiting (in queue), second call: Active (through queue)
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({
            status: 'Waiting',
            queue_position: 5,
            wait_time: 30,
          }),
        })
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({
            status: 'Active',
            queue_position: 0,
            wait_time: 0,
          }),
        });

      const service = new QueueService({
        pollIntervalMs: 1000,
        sessionRefreshBufferMs: 120000,
        maxRetries: 3,
        retryDelayMs: 500,
      });

      const waitPromise = service.waitForActive();

      // Advance past the first poll interval
      await jest.advanceTimersByTimeAsync(1000);
      // Allow the poll callback to resolve
      await jest.advanceTimersByTimeAsync(1000);

      const result = await waitPromise;

      expect(result.success).toBe(true);
      expect(result.session!.status).toBe('Active');
      // Initial check + at least one poll
      expect(mockAxiosInstance.get.mock.calls.length).toBeGreaterThanOrEqual(2);

      service.destroy();
    });

    it('should emit position_update events while waiting in queue', async () => {
      jest.useFakeTimers();

      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({
            status: 'Waiting',
            queue_position: 10,
            wait_time: 60,
          }),
        })
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({
            status: 'Waiting',
            queue_position: 5,
            wait_time: 30,
          }),
        })
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({
            status: 'Active',
            queue_position: 0,
            wait_time: 0,
          }),
        });

      const service = new QueueService({
        pollIntervalMs: 1000,
        sessionRefreshBufferMs: 120000,
        maxRetries: 3,
        retryDelayMs: 500,
      });

      const positionHandler = jest.fn();
      service.on('position_update', positionHandler);

      const waitPromise = service.waitForActive();

      // Advance through poll intervals
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(1000);

      await waitPromise;

      // Should have received at least one position update (for the Waiting responses)
      expect(positionHandler).toHaveBeenCalled();

      service.destroy();
    });

    it('should emit session_active when queue clears', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      const activeHandler = jest.fn();
      service.on('session_active', activeHandler);

      await service.waitForActive();

      expect(activeHandler).toHaveBeenCalledTimes(1);

      service.destroy();
    });

    it('should prevent concurrent waits (return same promise)', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();

      // Start two concurrent waits
      const wait1 = service.waitForActive();
      const wait2 = service.waitForActive();

      const [result1, result2] = await Promise.all([wait1, wait2]);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      service.destroy();
    });

    it('should handle API errors during polling gracefully and retry', async () => {
      jest.useFakeTimers();

      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({ status: 'Waiting', queue_position: 3 }),
        })
        // Poll fails once
        .mockRejectedValueOnce(new Error('Temporary network error'))
        // Then succeeds
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({ status: 'Active' }),
        });

      const service = new QueueService({
        pollIntervalMs: 1000,
        sessionRefreshBufferMs: 120000,
        maxRetries: 3,
        retryDelayMs: 500,
      });

      const waitPromise = service.waitForActive();

      // First poll interval (gets Waiting)
      await jest.advanceTimersByTimeAsync(1000);
      // Second poll (error, uses retryDelayMs)
      await jest.advanceTimersByTimeAsync(500);
      // Third poll (Active)
      await jest.advanceTimersByTimeAsync(1000);

      const result = await waitPromise;

      expect(result.success).toBe(true);

      service.destroy();
    });
  });

  describe('clearSession', () => {
    it('should clear session from memory and database', async () => {
      const mockRun = jest.fn();
      mockDbPrepare.mockReturnValue({ get: jest.fn().mockReturnValue(null), run: mockRun });

      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      expect(service.getSession()).not.toBeNull();

      service.clearSession();

      expect(service.getSession()).toBeNull();
      expect(service.getSessionCookie()).toBeNull();
      expect(service.isSessionActive()).toBe(false);

      // Should have called DELETE on database
      const deleteCalls = mockDbPrepare.mock.calls.filter(
        (call: string[]) =>
          typeof call[0] === 'string' && call[0].includes('DELETE FROM queue_session')
      );
      expect(deleteCalls.length).toBeGreaterThan(0);

      service.destroy();
    });
  });

  describe('database persistence', () => {
    it('should restore a valid (non-expired) session from database on startup', () => {
      const futureExpiry = new Date(Date.now() + 300000).toISOString();
      mockDbPrepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          session_key: 'RESTOREDKEY12345678901234567890123456789012345678901',
          status: 'Active',
          position: 0,
          estimated_wait_seconds: 0,
          expiry_seconds: 600,
          expires_at: futureExpiry,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        run: jest.fn(),
      });

      const service = new QueueService();
      const session = service.getSession();

      expect(session).not.toBeNull();
      expect(session!.sessionKey).toBe('RESTOREDKEY12345678901234567890123456789012345678901');
      expect(session!.status).toBe('Active');

      service.destroy();
    });

    it('should not restore an expired session from database', () => {
      const pastExpiry = new Date(Date.now() - 60000).toISOString();
      const mockRun = jest.fn();
      mockDbPrepare.mockReturnValue({
        get: jest.fn().mockReturnValue({
          session_key: 'EXPIREDKEY',
          status: 'Active',
          position: 0,
          estimated_wait_seconds: 0,
          expiry_seconds: 600,
          expires_at: pastExpiry,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        run: mockRun,
      });

      const service = new QueueService();
      const session = service.getSession();

      expect(session).toBeNull();

      // Should have called DELETE to clear expired session
      const deleteCalls = mockDbPrepare.mock.calls.filter(
        (call: string[]) =>
          typeof call[0] === 'string' && call[0].includes('DELETE FROM queue_session')
      );
      expect(deleteCalls.length).toBeGreaterThan(0);

      service.destroy();
    });
  });

  describe('estimated wait formatting', () => {
    it('should format seconds correctly', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Waiting', wait_time: 45 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      expect(service.getEstimatedWaitFormatted()).toBe('45 seconds');

      service.destroy();
    });

    it('should format minutes correctly', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Waiting', wait_time: 180 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      expect(service.getEstimatedWaitFormatted()).toBe('3 minutes');

      service.destroy();
    });

    it('should format 1 minute correctly (singular)', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Waiting', wait_time: 60 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      expect(service.getEstimatedWaitFormatted()).toBe('1 minute');

      service.destroy();
    });

    it('should return Unknown when no session', () => {
      const service = new QueueService();
      expect(service.getEstimatedWaitFormatted()).toBe('Unknown');
      service.destroy();
    });
  });

  describe('expiry time remaining', () => {
    it('should return formatted remaining time', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active', expiry_seconds: 300 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      const remaining = service.getExpiryTimeRemaining();
      // Should contain minutes (roughly 4-5 minutes)
      expect(remaining).toMatch(/\d+m \d+s/);

      service.destroy();
    });

    it('should return "No session" when no session exists', () => {
      const service = new QueueService();
      expect(service.getExpiryTimeRemaining()).toBe('No session');
      service.destroy();
    });
  });

  describe('session key generation', () => {
    it('should generate a 52-character alphanumeric session key', async () => {
      const apiResponse = mockQueueApiResponse();
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      // Verify the session key passed to the API was 52 chars
      const callArgs = mockAxiosInstance.get.mock.calls[0][1];
      const sessionKey = callArgs.params.session_key;
      expect(sessionKey).toHaveLength(52);
      expect(sessionKey).toMatch(/^[A-Z0-9]+$/);

      service.destroy();
    });
  });

  describe('isWaitingInQueue', () => {
    it('should return false initially', () => {
      const service = new QueueService();
      expect(service.isWaitingInQueue()).toBe(false);
      service.destroy();
    });

    it('should return true while polling in queue', async () => {
      jest.useFakeTimers();

      // Always return Waiting to keep it polling
      mockAxiosInstance.get.mockResolvedValue({
        data: mockQueueApiResponse({ status: 'Waiting', queue_position: 10 }),
      });

      const service = new QueueService({
        pollIntervalMs: 1000,
        sessionRefreshBufferMs: 120000,
        maxRetries: 3,
        retryDelayMs: 500,
      });

      // Start waiting (will not resolve since status stays 'Waiting')
      const waitPromise = service.waitForActive();

      // After initial check, should be waiting
      // Need a microtask tick for the async check to complete
      await Promise.resolve();
      await Promise.resolve();
      expect(service.isWaitingInQueue()).toBe(true);

      // Clean up: make next call return Active so the promise resolves
      mockAxiosInstance.get.mockResolvedValue({
        data: mockQueueApiResponse({ status: 'Active' }),
      });
      await jest.advanceTimersByTimeAsync(1000);

      await waitPromise;
      expect(service.isWaitingInQueue()).toBe(false);

      service.destroy();
    });
  });

  describe('destroy', () => {
    it('should clean up timers and listeners', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active', expiry_seconds: 600 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = new QueueService();
      await service.checkOrCreateSession();

      const handler = jest.fn();
      service.on('status', handler);

      service.destroy();

      // Listeners should be removed
      expect(service.listenerCount('status')).toBe(0);
    });
  });

  describe('queue delay simulation', () => {
    it('should wait through multiple queue positions before becoming active', async () => {
      jest.useFakeTimers();

      // Simulate moving through the queue: position 20 → 15 → 8 → 3 → Active
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({ status: 'Waiting', queue_position: 20, wait_time: 120 }),
        })
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({ status: 'Waiting', queue_position: 15, wait_time: 90 }),
        })
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({ status: 'Waiting', queue_position: 8, wait_time: 45 }),
        })
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({ status: 'Waiting', queue_position: 3, wait_time: 15 }),
        })
        .mockResolvedValueOnce({
          data: mockQueueApiResponse({ status: 'Active', queue_position: 0, wait_time: 0 }),
        });

      const service = new QueueService({
        pollIntervalMs: 5000,
        sessionRefreshBufferMs: 120000,
        maxRetries: 3,
        retryDelayMs: 2000,
      });

      const positionUpdates: number[] = [];
      service.on('position_update', (event) => {
        if (event.session) {
          positionUpdates.push(event.session.position);
        }
      });

      const activeHandler = jest.fn();
      service.on('session_active', activeHandler);

      const waitPromise = service.waitForActive();

      // Advance through 4 poll intervals (5 sec each)
      for (let i = 0; i < 4; i++) {
        await jest.advanceTimersByTimeAsync(5000);
      }

      const result = await waitPromise;

      expect(result.success).toBe(true);
      expect(result.session!.status).toBe('Active');
      expect(activeHandler).toHaveBeenCalledTimes(1);

      // Should have tracked position decreasing through the queue
      expect(positionUpdates.length).toBeGreaterThan(0);

      // Total API calls: 1 initial + 4 polls = 5
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(5);

      service.destroy();
    });
  });
});
