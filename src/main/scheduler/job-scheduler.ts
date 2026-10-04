/**
 * Job Scheduler: runs watches and snipes on time, never twice at once (tech-review #2, #11).
 *
 * - Watches: the due-loop (`watch-loop.ts`), one chained 30 s timer over `next_check_at`.
 * - Snipes: one timer chain per snipe (`snipe-runner.ts`), armed to the exact release.
 * - Sleep: `powerMonitor` `resume` and `unlock-screen` call `rescheduleAll()`. Timers do not
 *   count the time a computer sleeps, so every snipe timer is recomputed from the wall clock
 *   and overdue watches run at once.
 * - Quit: `stop()` aborts every check and attempt in flight and waits for them (bounded),
 *   so nothing writes to the database after `AppContainer.dispose` closes it.
 */

import type { SnipeExecutionResult, WatchExecutionResult } from '@shared/types';
import type { SiteSniperService } from '../core/snipes/snipe.service';
import type { WatchService } from '../core/watches/watch.service';
import type { ProviderRegistry } from '../providers/registry';
import { logger } from '../utils/logger';
import { SnipeRunner } from './snipe-runner';
import { WatchLoop } from './watch-loop';

const log = logger.child({ module: 'scheduler' });

/** The longest `stop()` waits for checks and attempts in flight before it gives up on them. */
export const SCHEDULER_STOP_GRACE_MS = 3_000;

type PowerEvent = 'resume' | 'unlock-screen';

/** The part of Electron's `powerMonitor` the scheduler uses. */
export interface PowerEvents {
  on(event: PowerEvent, listener: () => void): unknown;
  removeListener(event: PowerEvent, listener: () => void): unknown;
}

const POWER_EVENTS: readonly PowerEvent[] = ['resume', 'unlock-screen'];

export interface JobSchedulerDeps {
  watches: WatchService;
  snipes: SiteSniperService;
  providers: ProviderRegistry;
  /** Electron's `powerMonitor` (an EventEmitter in tests). */
  power?: PowerEvents;
  clock?: () => Date;
  stopGraceMs?: number;
}

export class JobScheduler {
  readonly watchLoop: WatchLoop;
  readonly snipeRunner: SnipeRunner;
  private readonly power?: PowerEvents;
  private readonly stopGraceMs: number;
  private running = false;
  private readonly onWake = (): void => {
    log.info('System resumed or unlocked: rescheduling');
    this.rescheduleAll();
  };

  constructor(deps: JobSchedulerDeps) {
    this.watchLoop = new WatchLoop({
      watches: deps.watches,
      providers: deps.providers,
      clock: deps.clock,
    });
    this.snipeRunner = new SnipeRunner({ snipes: deps.snipes, clock: deps.clock });
    this.power = deps.power;
    this.stopGraceMs = deps.stopGraceMs ?? SCHEDULER_STOP_GRACE_MS;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    log.info('Starting job scheduler...');
    this.running = true;
    this.watchLoop.start();
    this.snipeRunner.start();
    for (const event of POWER_EVENTS) this.power?.on(event, this.onWake);
    log.info('Job scheduler started');
  }

  /**
   * Stops every timer, aborts every check and attempt in flight, and resolves once they have
   * settled, or after `SCHEDULER_STOP_GRACE_MS` (it logs the ones still running). Never
   * rejects.
   */
  async stop(): Promise<void> {
    const wasRunning = this.running;
    this.running = false;
    for (const event of POWER_EVENTS) this.power?.removeListener(event, this.onWake);
    const pending = [...this.watchLoop.stop(), ...this.snipeRunner.stop()];
    if (wasRunning) log.info('Stopping job scheduler...');
    if (pending.length === 0) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const bound = new Promise<'bound'>((resolve) => {
      timer = setTimeout(() => resolve('bound'), this.stopGraceMs);
    });
    const settled = Promise.allSettled(pending).then(() => 'settled' as const);
    const outcome = await Promise.race([settled, bound]);
    clearTimeout(timer);
    if (outcome === 'bound') {
      log.warn(
        `Job scheduler stopped with ${pending.length} job(s) still running after ${this.stopGraceMs} ms`
      );
    }
  }

  /** Recomputes every snipe timer from the wall clock and runs overdue watches now. */
  rescheduleAll(): void {
    if (!this.running) return;
    this.snipeRunner.rescheduleAll();
    this.watchLoop.kick();
  }

  // ---- watches ------------------------------------------------------------------

  /** Checks the watch now, or joins its check in flight. */
  runWatchNow(watchId: number): Promise<WatchExecutionResult> {
    return this.watchLoop.runNow(watchId);
  }

  /** Stops the watch's check in flight (deactivated or deleted). */
  cancelWatch(watchId: number): void {
    this.watchLoop.cancel(watchId);
  }

  // ---- snipes -------------------------------------------------------------------

  /** Arms (or re-arms) the snipe with a new timer chain. Nothing is armed before `start`. */
  scheduleSnipe(snipeId: number): void {
    if (this.running) this.snipeRunner.arm(snipeId);
  }

  rescheduleSnipe(snipeId: number): void {
    this.scheduleSnipe(snipeId);
  }

  /** Stops the snipe's chain and aborts its attempt in flight. */
  unscheduleSnipe(snipeId: number): void {
    void this.snipeRunner.unschedule(snipeId);
  }

  /** One attempt now, or the attempt in flight. */
  runSnipeNow(snipeId: number): Promise<SnipeExecutionResult> {
    return this.snipeRunner.runNow(snipeId);
  }
}
