import * as cron from 'node-cron';
import { Watch, SiteSnipe } from '@shared/types';
import { SnipeReleaseMode, SnipeResult, SnipeStatus } from '@shared/types/common.types';
import { CANCELLATION_POLL_MIN_MS } from '@shared/constants';
import { WatchService } from '../services/watch/watch.service';
import { SiteSniperService } from '../services/sitesniper/sitesniper.service';

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
      console.log('Job scheduler already running');
      return;
    }

    console.log('Starting job scheduler...');
    this.isRunning = true;

    this.scheduleActiveWatches();
    this.scheduleActiveSnipes();
    this.scheduleCleanupJob();

    console.log('Job scheduler started');
  }

  /**
   * Stop the job scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('Job scheduler not running');
      return;
    }

    console.log('Stopping job scheduler...');

    this.jobs.forEach((job) => job.task.stop());
    this.jobs.clear();

    // Clear all snipe timers.
    Array.from(this.snipeTimers.keys()).forEach((key) => this.clearSnipeTimers(key));
    this.snipeTimers.clear();

    this.isRunning = false;
    console.log('Job scheduler stopped');
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
          console.log(`Executing watch ${watch.id}: ${watch.name}`);
          await this.watchService.execute(watch.id);
        } catch (error) {
          console.error(`Error executing watch ${watch.id}:`, error);
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

    console.log(
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
      console.log(`Scheduled cancellation snipe ${snipe.id} polling every ${interval}ms`);
      return;
    }

    const releaseAt = this.siteSniperService.computeReleaseAt(snipe);
    if (!releaseAt) {
      console.warn(`Snipe ${snipe.id} has no release instant; not scheduling`);
      return;
    }

    const timers: SnipeTimers = {};
    this.snipeTimers.set(key, timers);

    const warmupAt = releaseAt.getTime() - snipe.leadTimeSeconds * 1000;
    const delay = warmupAt - Date.now();

    if (delay > MAX_TIMER_MS) {
      // Too far out for a single timer — re-arm periodically.
      timers.rearmTimer = setTimeout(() => this.scheduleSnipe(snipe), REARM_INTERVAL_MS);
      console.log(
        `Snipe ${snipe.id} release far in the future; re-arm scheduled in ${REARM_INTERVAL_MS}ms`
      );
      return;
    }

    if (delay <= 0) {
      // Warm-up window already reached — start immediately.
      void this.startWarmup(snipe, releaseAt);
    } else {
      timers.warmupTimer = setTimeout(() => void this.startWarmup(snipe, releaseAt), delay);
      console.log(
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

    if (snipe.queueEnabled) {
      this.siteSniperService.setStatus(snipe.id, SnipeStatus.QUEUEING);
      const queue = this.siteSniperService.getQueueService();
      try {
        await queue.waitForActive();
        // Legitimate session refresh only — see QueueService.startKeepAlive.
        queue.startKeepAlive();
      } catch (error) {
        console.error(`Snipe ${snipe.id} queue warm-up failed:`, error);
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

    console.log(`Snipe ${snipe.id} sniping (poll ${snipe.pollIntervalMs}ms)`);
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
      if (done) {
        if (snipe.queueEnabled) {
          this.siteSniperService.getQueueService().stopKeepAlive();
        }
        this.unscheduleSnipe(snipe.id);
      }
    } catch (error) {
      console.error(`Error executing snipe ${snipe.id}:`, error);
    }
  }

  /**
   * Window expired without a hold: mark expired, deactivate, stop keepalive.
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
    if (snipe.queueEnabled) {
      this.siteSniperService.getQueueService().stopKeepAlive();
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
  }

  /**
   * Unschedule a job (watch/cleanup cron)
   */
  unscheduleJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.task.stop();
      this.jobs.delete(jobId);
      console.log(`Unscheduled job ${jobId}`);
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
      console.log(`Unscheduled snipe ${snipeId}`);
    }
  }

  /**
   * Execute a watch immediately (outside of schedule)
   */
  async executeWatchNow(watchId: number): Promise<any> {
    console.log(`Executing watch ${watchId} immediately`);
    return this.watchService.execute(watchId);
  }

  /**
   * Execute a snipe immediately (outside of schedule)
   */
  async executeSnipeNow(snipeId: number): Promise<any> {
    console.log(`Executing snipe ${snipeId} immediately`);
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
    console.log(`Scheduling ${activeWatches.length} active watches`);
    activeWatches.forEach((watch) => this.scheduleWatch(watch));
  }

  /**
   * Schedule all active snipes
   */
  scheduleActiveSnipes(): void {
    const activeSnipes = this.siteSniperService.getActive();
    console.log(`Scheduling ${activeSnipes.length} active snipes`);
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
          console.log('Running cleanup job');
          await this.runCleanup();
        } catch (error) {
          console.error('Error running cleanup job:', error);
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

    console.log('Scheduled daily cleanup job');
  }

  /**
   * Run cleanup tasks
   */
  private async runCleanup(): Promise<void> {
    console.log('Cleanup completed');
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
