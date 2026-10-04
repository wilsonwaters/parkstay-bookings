import * as cron from 'node-cron';
import { Watch, SiteSnipe } from '@shared/types';
import { SnipeReleaseMode, SnipeResult, SnipeStatus } from '@shared/types/common.types';
import { CANCELLATION_POLL_MIN_MS } from '@shared/constants';
import { WatchService } from '../services/watch/watch.service';
import { SiteSniperService } from '../services/sitesniper/sitesniper.service';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'scheduler' });

interface ScheduledJob {
  id: string;
  task: cron.ScheduledTask;
  type: 'watch' | 'cleanup';
  relatedId: number;
}

/**
 * Set of timers backing a single scheduled snipe. All must be cleared when the
 * snipe is unscheduled/stopped to avoid leaks and stray executions.
 */
interface SnipeTimers {
  warmupTimer?: NodeJS.Timeout; // fires at (releaseAt - leadTime), reused for the release fire
  pollInterval?: NodeJS.Timeout; // tight-poll cadence during the snipe window
  stopTimer?: NodeJS.Timeout; // fires at (releaseAt + windowDuration) to give up
  rearmTimer?: NodeJS.Timeout; // long-timer-safe re-arm for far-future releases
  accessWait?: AbortController; // cancels a warm-up waiting in the provider's queue
  releaseAccess?: () => void; // this snipe's hold on the queue keep-alive, released once
}

// setTimeout is only reliable up to ~24.8 days (2^31-1 ms). For anything further
// out we re-arm periodically instead of scheduling one enormous timeout.
const MAX_TIMER_MS = 2_000_000_000;
const REARM_INTERVAL_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * Job Scheduler
 *
 * Manages background jobs:
 * - Watches: node-cron (minute-granularity is fine for polling).
 * - Site Snipes: precise setTimeout/setInterval scheduling. node-cron cannot hit
 *   a sub-minute release instant, so snipes use timers armed to the exact release.
 * - Daily cleanup: node-cron.
 */
export class JobScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private snipeTimers: Map<string, SnipeTimers> = new Map();
  private watchService: WatchService;
  private siteSniperService: SiteSniperService;
  private isRunning: boolean = false;

  constructor(watchService: WatchService, siteSniperService: SiteSniperService) {
    this.watchService = watchService;
    this.siteSniperService = siteSniperService;
  }

  /**
   * Start the job scheduler
   */
  start(): void {
    if (this.isRunning) {
      log.info('Job scheduler already running');
      return;
    }

    log.info('Starting job scheduler...');
    this.isRunning = true;

    this.scheduleActiveWatches();
    this.scheduleActiveSnipes();
    this.scheduleCleanupJob();

    log.info('Job scheduler started');
  }

  /**
   * Stop the job scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      log.info('Job scheduler not running');
      return;
    }

    log.info('Stopping job scheduler...');

    this.jobs.forEach((job) => job.task.stop());
    this.jobs.clear();

    // Clear all snipe timers.
    Array.from(this.snipeTimers.keys()).forEach((key) => this.clearSnipeTimers(key));
    this.snipeTimers.clear();

    this.isRunning = false;
    log.info('Job scheduler stopped');
  }

  /**
   * Schedule a watch
   * Uses the watch creation time to offset when jobs run within the interval
   * to distribute server load across time rather than all at :00
   */
  scheduleWatch(watch: Watch): void {
    const jobId = `watch-${watch.id}`;

    this.unscheduleJob(jobId);

    if (!watch.isActive) {
      return;
    }

    const createdAt = new Date(watch.createdAt);
    const minute = createdAt.getMinutes();
    const hour = createdAt.getHours();

    let cronExpression: string;
    const intervalMinutes = watch.checkIntervalMinutes;

    if (intervalMinutes <= 60) {
      cronExpression = `${minute} * * * *`;
    } else if (intervalMinutes <= 240) {
      const hourOffset = hour % 4;
      const hours = [0, 4, 8, 12, 16, 20].map((h) => (h + hourOffset) % 24).sort((a, b) => a - b);
      cronExpression = `${minute} ${hours.join(',')} * * *`;
    } else if (intervalMinutes <= 720) {
      const hourOffset = hour % 12;
      const hours = [hourOffset, (hourOffset + 12) % 24].sort((a, b) => a - b);
      cronExpression = `${minute} ${hours.join(',')} * * *`;
    } else {
      cronExpression = `${minute} ${hour} * * *`;
    }

    const task = cron.schedule(
      cronExpression,
      async () => {
        try {
          log.info(`Executing watch ${watch.id}: ${watch.name}`);
          await this.watchService.execute(watch.id);
        } catch (error) {
          log.error(`Error executing watch ${watch.id}:`, error);
        }
      },
      {
        scheduled: true,
        timezone: 'Australia/Perth',
      }
    );

    this.jobs.set(jobId, {
      id: jobId,
      task,
      type: 'watch',
      relatedId: watch.id,
    });

    log.info(
      `Scheduled watch ${watch.id} with cron "${cronExpression}" (interval ${watch.checkIntervalMinutes} min)`
    );
  }

  /**
   * Schedule a Site Snipe.
   *
   * - CANCELLATION: continuous setInterval poll (clamped to a politeness floor).
   * - DAILY_ROLLOVER / SCHEDULED: arm a warm-up timer at (releaseAt - leadTime),
   *   then poll tightly from the release instant until the window elapses. Uses a
   *   long-timer-safe re-arm for far-future releases.
   */
  scheduleSnipe(snipe: SiteSnipe): void {
    this.unscheduleSnipe(snipe.id);

    if (!snipe.isActive) {
      return;
    }

    const key = `snipe-${snipe.id}`;

    if (snipe.releaseMode === SnipeReleaseMode.CANCELLATION) {
      const interval = Math.max(snipe.pollIntervalMs, CANCELLATION_POLL_MIN_MS);
      const timers: SnipeTimers = {};
      timers.pollInterval = setInterval(() => {
        void this.runSnipeTick(snipe);
      }, interval);
      this.snipeTimers.set(key, timers);
      this.siteSniperService.setStatus(snipe.id, SnipeStatus.SNIPING);
      log.info(`Scheduled cancellation snipe ${snipe.id} polling every ${interval}ms`);
      return;
    }

    const releaseAt = this.siteSniperService.computeReleaseAt(snipe);
    if (!releaseAt) {
      log.warn(`Snipe ${snipe.id} has no release instant; not scheduling`);
      return;
    }

    const timers: SnipeTimers = {};
    this.snipeTimers.set(key, timers);

    const warmupAt = releaseAt.getTime() - snipe.leadTimeSeconds * 1000;
    const delay = warmupAt - Date.now();

    if (delay > MAX_TIMER_MS) {
      // Too far out for a single timer — re-arm periodically.
      timers.rearmTimer = setTimeout(() => this.scheduleSnipe(snipe), REARM_INTERVAL_MS);
      log.info(
        `Snipe ${snipe.id} release far in the future; re-arm scheduled in ${REARM_INTERVAL_MS}ms`
      );
      return;
    }

    if (delay <= 0) {
      // Warm-up window already reached — start immediately.
      void this.startWarmup(snipe, releaseAt);
    } else {
      timers.warmupTimer = setTimeout(() => void this.startWarmup(snipe, releaseAt), delay);
      log.info(
        `Scheduled snipe ${snipe.id} warm-up in ${delay}ms (release at ${releaseAt.toISOString()})`
      );
    }
  }

  /**
   * Warm-up phase: establish the DBCA queue session if required, then wait for the
   * exact release instant.
   */
  private async startWarmup(snipe: SiteSnipe, releaseAt: Date): Promise<void> {
    const key = `snipe-${snipe.id}`;
    const timers = this.snipeTimers.get(key);
    if (!timers) return;

    const current = await this.siteSniperService.get(snipe.id);
    if (!current || !current.isActive) {
      this.unscheduleSnipe(snipe.id);
      return;
    }

    const gate = snipe.accessGateEnabled ? this.siteSniperService.getAccessGate() : undefined;
    if (gate) {
      this.siteSniperService.setStatus(snipe.id, SnipeStatus.QUEUEING);
      const wait = new AbortController();
      timers.accessWait = wait;
      try {
        // Waiting in the queue is pointless once the snipe window has closed.
        const maxWaitMs = Math.max(releaseAt.getTime() + snipe.windowDurationMs - Date.now(), 0);
        await gate.ensure({ signal: wait.signal, maxWaitMs });
        // Keeps the queue session fresh (the ParkStay page's own refresh, nothing more) until
        // this snipe stops; the gate keeps refreshing while any snipe holds it.
        timers.releaseAccess ??= gate.holdOpen();
      } catch (error) {
        if (wait.signal.aborted) return; // unscheduled while waiting
        log.error(`Snipe ${snipe.id} queue warm-up failed:`, error);
      } finally {
        timers.accessWait = undefined;
      }
      if (this.snipeTimers.get(key) !== timers) {
        // Unscheduled while waiting: let go of the queue.
        timers.releaseAccess?.();
        return;
      }
    }

    this.siteSniperService.setStatus(snipe.id, SnipeStatus.WAITING_RELEASE);

    const untilRelease = releaseAt.getTime() - Date.now();
    if (untilRelease <= 0) {
      this.startSniping(snipe, releaseAt);
    } else {
      timers.warmupTimer = setTimeout(
        () => this.startSniping(snipe, releaseAt),
        Math.min(untilRelease, MAX_TIMER_MS)
      );
    }
  }

  /**
   * Sniping phase: tight-poll availability until held/booked, or until the window
   * elapses (then expire + deactivate).
   */
  private startSniping(snipe: SiteSnipe, releaseAt: Date): void {
    const key = `snipe-${snipe.id}`;
    const timers = this.snipeTimers.get(key);
    if (!timers) return;

    this.siteSniperService.setStatus(snipe.id, SnipeStatus.SNIPING);

    timers.pollInterval = setInterval(() => {
      void this.runSnipeTick(snipe);
    }, snipe.pollIntervalMs);

    const stopDelay = releaseAt.getTime() + snipe.windowDurationMs - Date.now();
    timers.stopTimer = setTimeout(() => void this.stopSnipeWindow(snipe), Math.max(stopDelay, 0));

    log.info(`Snipe ${snipe.id} sniping (poll ${snipe.pollIntervalMs}ms)`);
  }

  /**
   * One poll tick: run an attempt and stop the schedule if terminal.
   */
  private async runSnipeTick(snipe: SiteSnipe): Promise<void> {
    try {
      const result = await this.siteSniperService.execute(snipe.id);
      const current = await this.siteSniperService.get(snipe.id);
      const done =
        result.held || result.result === SnipeResult.BOOKED || !current || !current.isActive;
      if (done) this.unscheduleSnipe(snipe.id);
    } catch (error) {
      log.error(`Error executing snipe ${snipe.id}:`, error);
    }
  }

  /**
   * Window expired without a hold: mark expired, deactivate, and let go of the queue.
   */
  private async stopSnipeWindow(snipe: SiteSnipe): Promise<void> {
    const current = await this.siteSniperService.get(snipe.id);
    if (
      current &&
      current.isActive &&
      current.status !== SnipeStatus.HELD &&
      current.status !== SnipeStatus.BOOKED
    ) {
      this.siteSniperService.setStatus(snipe.id, SnipeStatus.EXPIRED);
      await this.siteSniperService.deactivate(snipe.id);
    }
    this.unscheduleSnipe(snipe.id);
  }

  /**
   * Clear (but do not delete the map entry for) all timers of a snipe.
   */
  private clearSnipeTimers(key: string): void {
    const timers = this.snipeTimers.get(key);
    if (!timers) return;
    if (timers.warmupTimer) clearTimeout(timers.warmupTimer);
    if (timers.stopTimer) clearTimeout(timers.stopTimer);
    if (timers.rearmTimer) clearTimeout(timers.rearmTimer);
    if (timers.pollInterval) clearInterval(timers.pollInterval);
    timers.accessWait?.abort();
    timers.releaseAccess?.();
    timers.releaseAccess = undefined;
  }

  /**
   * Unschedule a job (watch/cleanup cron)
   */
  unscheduleJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.task.stop();
      this.jobs.delete(jobId);
      log.info(`Unscheduled job ${jobId}`);
    }
  }

  /**
   * Unschedule a watch
   */
  unscheduleWatch(watchId: number): void {
    this.unscheduleJob(`watch-${watchId}`);
  }

  /**
   * Unschedule a snipe — clears every timer and removes the entry.
   */
  unscheduleSnipe(snipeId: number): void {
    const key = `snipe-${snipeId}`;
    if (this.snipeTimers.has(key)) {
      this.clearSnipeTimers(key);
      this.snipeTimers.delete(key);
      log.info(`Unscheduled snipe ${snipeId}`);
    }
  }

  /**
   * Execute a watch immediately (outside of schedule)
   */
  async executeWatchNow(watchId: number): Promise<any> {
    log.info(`Executing watch ${watchId} immediately`);
    return this.watchService.execute(watchId);
  }

  /**
   * Execute a snipe immediately (outside of schedule)
   */
  async executeSnipeNow(snipeId: number): Promise<any> {
    log.info(`Executing snipe ${snipeId} immediately`);
    return this.siteSniperService.execute(snipeId);
  }

  /**
   * Reschedule a snipe (e.g. after an update)
   */
  async rescheduleSnipe(snipeId: number): Promise<void> {
    const snipe = await this.siteSniperService.get(snipeId);
    if (snipe) {
      this.scheduleSnipe(snipe);
    }
  }

  /**
   * Schedule all active watches
   */
  private scheduleActiveWatches(): void {
    const activeWatches = this.watchService.getActiveWatches();
    log.info(`Scheduling ${activeWatches.length} active watches`);
    activeWatches.forEach((watch) => this.scheduleWatch(watch));
  }

  /**
   * Schedule all active snipes
   */
  scheduleActiveSnipes(): void {
    const activeSnipes = this.siteSniperService.getActive();
    log.info(`Scheduling ${activeSnipes.length} active snipes`);
    activeSnipes.forEach((snipe) => this.scheduleSnipe(snipe));
  }

  /**
   * Schedule cleanup job
   */
  private scheduleCleanupJob(): void {
    const task = cron.schedule(
      '0 2 * * *',
      async () => {
        try {
          log.info('Running cleanup job');
          await this.runCleanup();
        } catch (error) {
          log.error('Error running cleanup job:', error);
        }
      },
      {
        scheduled: true,
        timezone: 'Australia/Perth',
      }
    );

    this.jobs.set('cleanup', {
      id: 'cleanup',
      task,
      type: 'cleanup',
      relatedId: 0,
    });

    log.info('Scheduled daily cleanup job');
  }

  /**
   * Run cleanup tasks
   */
  private async runCleanup(): Promise<void> {
    log.info('Cleanup completed');
  }

  /**
   * Get job status
   */
  getJobStatus(): {
    isRunning: boolean;
    totalJobs: number;
    watches: number;
    snipes: number;
  } {
    let watches = 0;
    this.jobs.forEach((job) => {
      if (job.type === 'watch') watches++;
    });

    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.size + this.snipeTimers.size,
      watches,
      snipes: this.snipeTimers.size,
    };
  }

  /**
   * Reschedule watch (useful when watch is updated)
   */
  async rescheduleWatch(watchId: number): Promise<void> {
    const watch = await this.watchService.get(watchId);
    if (watch) {
      this.scheduleWatch(watch);
    }
  }
}
