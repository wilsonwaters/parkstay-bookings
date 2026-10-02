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

import { QueueAPIResponse, QueueSession } from '@shared/types';
import axios from 'axios';
import { QueueService } from '@main/services/queue/queue.service';
import type { QueueSessionRepository } from '@main/database/repositories/queue-session.repository';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Constructor fake for the session repository: no database needed.
const sessionRepo = {
  get: jest.fn<QueueSession | null, []>(),
  save: jest.fn<void, [QueueSession]>(),
  clear: jest.fn<void, []>(),
};

function createService(config?: ConstructorParameters<typeof QueueService>[1]): QueueService {
  return new QueueService(sessionRepo as unknown as QueueSessionRepository, config);
}

function storedSession(overrides: Partial<QueueSession> = {}): QueueSession {
  return {
    sessionKey: 'RESTOREDKEY12345678901234567890123456789012345678901',
    status: 'Active',
    position: 0,
    estimatedWaitSeconds: 0,
    expirySeconds: 600,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 300000),
    lastCheckedAt: new Date(),
    ...overrides,
  };
}

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
    sessionRepo.get.mockReset().mockReturnValue(null);
    sessionRepo.save.mockReset();
    sessionRepo.clear.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('checkOrCreateSession', () => {
    it('should create a session and return it when API responds Active', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active', queue_position: 0 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
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

      const service = createService();
      const session = await service.checkOrCreateSession();

      expect(session.status).toBe('Waiting');
      expect(session.position).toBe(42);
      expect(session.estimatedWaitSeconds).toBe(120);

      service.destroy();
    });

    it('should call queue API with correct params', async () => {
      const apiResponse = mockQueueApiResponse();
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
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

      const service = createService();
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

      const service = createService();
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

      const service = createService();
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

      const service = createService();
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
      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      expect(sessionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ sessionKey: apiResponse.session_key, status: 'Active' })
      );

      service.destroy();
    });
  });

  describe('session state checks', () => {
    it('isSessionActive returns true for active non-expired session', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active', expiry_seconds: 600 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      expect(service.isSessionActive()).toBe(true);
      expect(service.isSessionExpired()).toBe(false);

      service.destroy();
    });

    it('isSessionActive returns false for Waiting status', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Waiting' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      expect(service.isSessionActive()).toBe(false);

      service.destroy();
    });

    it('isSessionActive returns false when no session exists', () => {
      const service = createService();

      expect(service.isSessionActive()).toBe(false);
      expect(service.isSessionExpired()).toBe(true);

      service.destroy();
    });

    it('getSessionCookie returns session key', async () => {
      const apiResponse = mockQueueApiResponse();
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      expect(service.getSessionCookie()).toBe(apiResponse.session_key);

      service.destroy();
    });

    it('getSessionCookie returns null when no session', () => {
      const service = createService();
      expect(service.getSessionCookie()).toBeNull();
      service.destroy();
    });
  });

  describe('waitForActive', () => {
    it('should return immediately if session is already Active', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
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

      const service = createService({
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

      const service = createService({
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

      const service = createService();
      const activeHandler = jest.fn();
      service.on('session_active', activeHandler);

      await service.waitForActive();

      expect(activeHandler).toHaveBeenCalledTimes(1);

      service.destroy();
    });

    it('should prevent concurrent waits (return same promise)', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();

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

      const service = createService({
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
      const apiResponse = mockQueueApiResponse({ status: 'Active' });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      expect(service.getSession()).not.toBeNull();

      service.clearSession();

      expect(service.getSession()).toBeNull();
      expect(service.getSessionCookie()).toBeNull();
      expect(service.isSessionActive()).toBe(false);

      // Should have cleared the stored session
      expect(sessionRepo.clear).toHaveBeenCalled();

      service.destroy();
    });
  });

  describe('database persistence', () => {
    it('should restore a valid (non-expired) session from database on startup', () => {
      sessionRepo.get.mockReturnValue(storedSession());

      const service = createService();
      const session = service.getSession();

      expect(session).not.toBeNull();
      expect(session!.sessionKey).toBe('RESTOREDKEY12345678901234567890123456789012345678901');
      expect(session!.status).toBe('Active');

      service.destroy();
    });

    it('should not restore an expired session from database', () => {
      sessionRepo.get.mockReturnValue(
        storedSession({ sessionKey: 'EXPIREDKEY', expiresAt: new Date(Date.now() - 60000) })
      );

      const service = createService();
      const session = service.getSession();

      expect(session).toBeNull();

      // Should have cleared the expired stored session
      expect(sessionRepo.clear).toHaveBeenCalled();

      service.destroy();
    });
  });

  describe('estimated wait formatting', () => {
    it('should format seconds correctly', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Waiting', wait_time: 45 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      expect(service.getEstimatedWaitFormatted()).toBe('45 seconds');

      service.destroy();
    });

    it('should format minutes correctly', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Waiting', wait_time: 180 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      expect(service.getEstimatedWaitFormatted()).toBe('3 minutes');

      service.destroy();
    });

    it('should format 1 minute correctly (singular)', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Waiting', wait_time: 60 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      expect(service.getEstimatedWaitFormatted()).toBe('1 minute');

      service.destroy();
    });

    it('should return Unknown when no session', () => {
      const service = createService();
      expect(service.getEstimatedWaitFormatted()).toBe('Unknown');
      service.destroy();
    });
  });

  describe('expiry time remaining', () => {
    it('should return formatted remaining time', async () => {
      const apiResponse = mockQueueApiResponse({ status: 'Active', expiry_seconds: 300 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      const remaining = service.getExpiryTimeRemaining();
      // Should contain minutes (roughly 4-5 minutes)
      expect(remaining).toMatch(/\d+m \d+s/);

      service.destroy();
    });

    it('should return "No session" when no session exists', () => {
      const service = createService();
      expect(service.getExpiryTimeRemaining()).toBe('No session');
      service.destroy();
    });
  });

  describe('session key generation', () => {
    it('should generate a 52-character alphanumeric session key', async () => {
      const apiResponse = mockQueueApiResponse();
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
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
      const service = createService();
      expect(service.isWaitingInQueue()).toBe(false);
      service.destroy();
    });

    it('should return true while polling in queue', async () => {
      jest.useFakeTimers();

      // Always return Waiting to keep it polling
      mockAxiosInstance.get.mockResolvedValue({
        data: mockQueueApiResponse({ status: 'Waiting', queue_position: 10 }),
      });

      const service = createService({
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
    it('should clean up its timers and leave each subscriber to remove its own listener', async () => {
      jest.useFakeTimers();
      const apiResponse = mockQueueApiResponse({ status: 'Active', expiry_seconds: 600 });
      mockAxiosInstance.get.mockResolvedValue({ data: apiResponse });

      const service = createService();
      await service.checkOrCreateSession();

      const handler = jest.fn();
      const other = jest.fn();
      service.on('status', handler);
      service.on('status', other);
      expect(jest.getTimerCount()).toBeGreaterThan(0);

      service.destroy();

      // No refresh, poll or keep-alive timer survives
      expect(jest.getTimerCount()).toBe(0);
      // Subscribers own their listeners (the composition root removes its forwarder on
      // dispose): destroy does not wipe one subscriber's listener for another.
      service.off('status', handler);
      expect(service.listeners('status')).toEqual([other]);
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

      const service = createService({
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
