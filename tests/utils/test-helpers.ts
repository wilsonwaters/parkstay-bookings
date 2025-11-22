/**
 * Test Helpers
 * Common utilities for tests
 */

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate random string
 */
export function randomString(length: number = 10): string {
  return Math.random()
    .toString(36)
    .substring(2, length + 2);
}

/**
 * Generate random number in range
 */
export function randomNumber(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random email
 */
export function randomEmail(): string {
  return `test-${randomString()}@example.com`;
}

/**
 * Generate random date in future
 */
export function randomFutureDate(daysFromNow: number = 30): Date {
  const date = new Date();
  date.setDate(date.getDate() + randomNumber(1, daysFromNow));
  return date;
}

/**
 * Generate random booking reference
 */
export function randomBookingReference(): string {
  return `BK${randomNumber(100000, 999999)}`;
}

/**
 * Format date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Create mock function with implementation
 */
export function createMockFn<T extends (...args: any[]) => any>(
  implementation?: T
): jest.Mock<ReturnType<T>, Parameters<T>> {
  return jest.fn(implementation);
}

/**
 * Spy on console methods
 */
export function spyOnConsole(): {
  log: jest.SpyInstance;
  error: jest.SpyInstance;
  warn: jest.SpyInstance;
  info: jest.SpyInstance;
} {
  return {
    log: jest.spyOn(console, 'log').mockImplementation(() => {}),
    error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
    info: jest.spyOn(console, 'info').mockImplementation(() => {}),
  };
}

/**
 * Restore console spies
 */
export function restoreConsole(spies: ReturnType<typeof spyOnConsole>): void {
  spies.log.mockRestore();
  spies.error.mockRestore();
  spies.warn.mockRestore();
  spies.info.mockRestore();
}

/**
 * Assert async function throws
 */
export async function expectAsyncThrow(
  fn: () => Promise<any>,
  errorMessage?: string | RegExp
): Promise<void> {
  let error: Error | undefined;

  try {
    await fn();
  } catch (e: any) {
    error = e;
  }

  if (!error) {
    throw new Error('Expected function to throw, but it did not');
  }

  if (errorMessage) {
    if (typeof errorMessage === 'string') {
      expect(error.message).toContain(errorMessage);
    } else {
      expect(error.message).toMatch(errorMessage);
    }
  }
}

/**
 * Retry a function until it succeeds or max retries reached
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (i < maxRetries - 1) {
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * Mock timer helpers
 */
export class MockTimer {
  static useFakeTimers(): void {
    jest.useFakeTimers();
  }

  static useRealTimers(): void {
    jest.useRealTimers();
  }

  static async advanceTimersByTime(ms: number): Promise<void> {
    jest.advanceTimersByTime(ms);
    await Promise.resolve(); // Allow promises to resolve
  }

  static async runAllTimers(): Promise<void> {
    jest.runAllTimers();
    await Promise.resolve();
  }

  static async runOnlyPendingTimers(): Promise<void> {
    jest.runOnlyPendingTimers();
    await Promise.resolve();
  }
}
