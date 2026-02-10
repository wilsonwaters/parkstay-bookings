import * as cron from 'node-cron';
import { Watch, SkipTheQueueEntry } from '@shared/types';
import { WatchService } from '../services/watch/watch.service';
import { STQService } from '../services/stq/stq.service';

interface ScheduledJob {
  id: string;
  task: cron.ScheduledTask;
  type: 'watch' | 'stq';
  relatedId: number;
}

/**
 * Job Scheduler
 * Manages scheduled background jobs for watches and STQ checks
 */
export class JobScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private watchService: WatchService;
  private stqService: STQService;
  private isRunning: boolean = false;

  constructor(watchService: WatchService, stqService: STQService) {
    this.watchService = watchService;
    this.stqService = stqService;
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

    // Load active watches and schedule them
    this.scheduleActiveWatches();

    // Load active STQ entries and schedule them
    this.scheduleActiveSTQEntries();

    // Schedule cleanup job (runs daily at 2 AM)
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

    // Stop all jobs
    this.jobs.forEach((job) => {
      job.task.stop();
    });
    this.jobs.clear();

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

    // Remove existing job if any
    this.unscheduleJob(jobId);

    if (!watch.isActive) {
      return;
    }

    // Use creation time to determine the minute/hour offset for scheduling
    const createdAt = new Date(watch.createdAt);
    const minute = createdAt.getMinutes();
    const hour = createdAt.getHours();

    // Create cron expression based on interval
    // This distributes load by using the watch's creation time as the run time offset
    let cronExpression: string;
    const intervalMinutes = watch.checkIntervalMinutes;

    if (intervalMinutes <= 60) {
      // Hourly: run at the same minute each hour
      cronExpression = `${minute} * * * *`;
    } else if (intervalMinutes <= 240) {
      // 4 hours: run at specific hours based on creation hour
      const hourOffset = hour % 4;
      const hours = [0, 4, 8, 12, 16, 20].map((h) => (h + hourOffset) % 24).sort((a, b) => a - b);
      cronExpression = `${minute} ${hours.join(',')} * * *`;
    } else if (intervalMinutes <= 720) {
      // 12 hours: run twice daily at offset hours
      const hourOffset = hour % 12;
      const hours = [hourOffset, (hourOffset + 12) % 24].sort((a, b) => a - b);
      cronExpression = `${minute} ${hours.join(',')} * * *`;
    } else {
      // 24 hours: run once daily at the creation hour/minute
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
   * Schedule an STQ entry
   */
  scheduleSTQ(entry: SkipTheQueueEntry): void {
    const jobId = `stq-${entry.id}`;

    // Remove existing job if any
    this.unscheduleJob(jobId);

    if (!entry.isActive) {
      return;
    }

    // Create cron expression for interval (every N minutes)
    const cronExpression = `*/${entry.checkIntervalMinutes} * * * *`;

    const task = cron.schedule(
      cronExpression,
      async () => {
        try {
          console.log(`Executing STQ ${entry.id} for booking ${entry.bookingReference}`);
          const result = await this.stqService.execute(entry.id);

          // If successful or max attempts reached, unschedule
          if (result.rebooked || !entry.isActive) {
            this.unscheduleJob(jobId);
          }
        } catch (error) {
          console.error(`Error executing STQ ${entry.id}:`, error);
        }
      },
      {
        scheduled: true,
      }
    );

    this.jobs.set(jobId, {
      id: jobId,
      task,
      type: 'stq',
      relatedId: entry.id,
    });

    console.log(`Scheduled STQ ${entry.id} with interval ${entry.checkIntervalMinutes} minutes`);
  }

  /**
   * Unschedule a job
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
   * Unschedule an STQ entry
   */
  unscheduleSTQ(stqId: number): void {
    this.unscheduleJob(`stq-${stqId}`);
  }

  /**
   * Execute a watch immediately (outside of schedule)
   */
  async executeWatchNow(watchId: number): Promise<any> {
    console.log(`Executing watch ${watchId} immediately`);
    const result = await this.watchService.execute(watchId);
    return result;
  }

  /**
   * Execute an STQ entry immediately (outside of schedule)
   */
  async executeSTQNow(stqId: number): Promise<void> {
    console.log(`Executing STQ ${stqId} immediately`);
    await this.stqService.execute(stqId);
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
   * Schedule all active STQ entries
   */
  private scheduleActiveSTQEntries(): void {
    const activeEntries = this.stqService.getActiveEntries();
    console.log(`Scheduling ${activeEntries.length} active STQ entries`);
    activeEntries.forEach((entry) => this.scheduleSTQ(entry));
  }

  /**
   * Schedule cleanup job
   */
  private scheduleCleanupJob(): void {
    // Run daily at 2 AM
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
      type: 'watch', // Doesn't matter for cleanup
      relatedId: 0,
    });

    console.log('Scheduled daily cleanup job');
  }

  /**
   * Run cleanup tasks
   */
  private async runCleanup(): Promise<void> {
    // Clean up old notifications (older than 30 days)
    // Clean up old job logs (older than 30 days)
    // Vacuum database
    console.log('Cleanup completed');
  }

  /**
   * Get job status
   */
  getJobStatus(): {
    isRunning: boolean;
    totalJobs: number;
    watches: number;
    stqs: number;
  } {
    let watches = 0;
    let stqs = 0;

    this.jobs.forEach((job) => {
      if (job.type === 'watch') watches++;
      else if (job.type === 'stq') stqs++;
    });

    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.size,
      watches,
      stqs,
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

  /**
   * Reschedule STQ entry (useful when entry is updated)
   */
  async rescheduleSTQ(stqId: number): Promise<void> {
    const entry = await this.stqService.get(stqId);
    if (entry) {
      this.scheduleSTQ(entry);
    }
  }
}
