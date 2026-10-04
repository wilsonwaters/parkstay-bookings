/**
 * JobScheduler's snipe warm-up with the provider's access gate (the DBCA queue): it waits
 * with `ensure({ signal, maxWaitMs })`, keeps the session alive with one `holdOpen()` per
 * snipe, and lets go of exactly that hold when the snipe stops (tech-review #10).
 */

import { JobScheduler } from '@main/scheduler/job-scheduler';
import type { SiteSniperService } from '@main/services/sitesniper/sitesniper.service';
import type { WatchService } from '@main/services/watch/watch.service';
import { AccessGateError } from '@main/providers/sdk';
import { SnipeReleaseMode, SnipeStatus } from '@shared/types/common.types';
import { createMockSiteSnipe } from '@tests/fixtures/site-sniper';

const NOW = new Date('2026-10-02T02:00:00.000Z');

describe('JobScheduler snipe warm-up with the access gate', () => {
  let gate: { ensure: jest.Mock; holdOpen: jest.Mock; releases: jest.Mock[] };
  let sniper: Record<string, jest.Mock>;
  let scheduler: JobScheduler;

  const snipe = (id: number, overrides = {}) =>
    createMockSiteSnipe({
      id,
      isActive: true,
      accessGateEnabled: true,
      releaseMode: SnipeReleaseMode.SCHEDULED,
      // Warm-up (2 minutes ahead) has already begun; the release is in a minute.
      releaseAt: new Date(NOW.getTime() + 60_000),
      leadTimeSeconds: 120,
      windowDurationMs: 900_000,
      ...overrides,
    });

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    const releases: jest.Mock[] = [];
    gate = {
      ensure: jest.fn().mockResolvedValue({ providerId: 'parkstay', state: 'active' }),
      holdOpen: jest.fn(() => {
        const release = jest.fn();
        releases.push(release);
        return release;
      }),
      releases,
    };
    sniper = {
      get: jest.fn(async (id: number) => snipe(id)),
      setStatus: jest.fn(),
      getAccessGate: jest.fn(() => gate),
      computeReleaseAt: jest.fn((s) => s.releaseAt),
      execute: jest.fn(),
      deactivate: jest.fn(),
      getActive: jest.fn(() => []),
    };
    scheduler = new JobScheduler(
      { getActiveWatches: () => [] } as unknown as WatchService,
      sniper as unknown as SiteSniperService
    );
  });

  afterEach(() => {
    scheduler.stop();
    jest.useRealTimers();
  });

  it('waits in the queue until the end of the snipe window, then holds the session open', async () => {
    scheduler.scheduleSnipe(snipe(1));
    await jest.advanceTimersByTimeAsync(0);

    expect(sniper.setStatus).toHaveBeenNthCalledWith(1, 1, SnipeStatus.QUEUEING);
    expect(gate.ensure).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
      maxWaitMs: 60_000 + 900_000,
    });
    expect(gate.holdOpen).toHaveBeenCalledTimes(1);
    expect(sniper.setStatus).toHaveBeenLastCalledWith(1, SnipeStatus.WAITING_RELEASE);
  });

  it('releases its own hold exactly once when the snipe stops, leaving another snipe’s hold', async () => {
    scheduler.scheduleSnipe(snipe(1));
    scheduler.scheduleSnipe(snipe(2));
    await jest.advanceTimersByTimeAsync(0);
    const [first, second] = gate.releases;

    scheduler.unscheduleSnipe(1);
    scheduler.unscheduleSnipe(1);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    scheduler.unscheduleSnipe(2);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cancels a wait in the queue when the snipe is unscheduled, without holding the session', async () => {
    let signal: AbortSignal | undefined;
    gate.ensure.mockImplementation(
      (options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.signal;
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    );
    scheduler.scheduleSnipe(snipe(1));
    await jest.advanceTimersByTimeAsync(0);
    expect(signal?.aborted).toBe(false);

    scheduler.unscheduleSnipe(1);
    await jest.advanceTimersByTimeAsync(0);

    expect(signal?.aborted).toBe(true);
    expect(gate.holdOpen).not.toHaveBeenCalled();
    expect(sniper.setStatus).not.toHaveBeenCalledWith(1, SnipeStatus.WAITING_RELEASE);
  });

  it('carries on to the release when the queue cannot be entered', async () => {
    gate.ensure.mockRejectedValue(new AccessGateError('parkstay', 'error', 'queue down'));
    scheduler.scheduleSnipe(snipe(1));
    await jest.advanceTimersByTimeAsync(0);

    expect(gate.holdOpen).not.toHaveBeenCalled();
    expect(sniper.setStatus).toHaveBeenLastCalledWith(1, SnipeStatus.WAITING_RELEASE);
  });

  it('does not touch the queue for a snipe that does not use it', async () => {
    scheduler.scheduleSnipe(snipe(1, { accessGateEnabled: false }));
    await jest.advanceTimersByTimeAsync(0);
    expect(gate.ensure).not.toHaveBeenCalled();
    expect(sniper.setStatus).toHaveBeenLastCalledWith(1, SnipeStatus.WAITING_RELEASE);
  });
});
