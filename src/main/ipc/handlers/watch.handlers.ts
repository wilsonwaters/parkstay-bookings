import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { WatchService } from '../../services/watch/watch.service';
import { WatchInput } from '@shared/types';
import { JobScheduler } from '../../scheduler/job-scheduler';

/**
 * Register Watch IPC handlers
 */
export function registerWatchHandlers(
  watchService: WatchService,
  jobScheduler: JobScheduler
): void {
  // Create watch
  ipcMain.handle(
    IPC_CHANNELS.WATCH_CREATE,
    async (_event: IpcMainInvokeEvent, userId: number, input: WatchInput) => {
      try {
        const watch = await watchService.create(userId, input);
        // Schedule the watch
        jobScheduler.scheduleWatch(watch);
        return { success: true, data: watch };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Get watch
  ipcMain.handle(
    IPC_CHANNELS.WATCH_GET,
    async (_event: IpcMainInvokeEvent, id: number) => {
      try {
        const watch = await watchService.get(id);
        return { success: true, data: watch };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // List watches
  ipcMain.handle(
    IPC_CHANNELS.WATCH_LIST,
    async (_event: IpcMainInvokeEvent, userId: number) => {
      try {
        const watches = await watchService.list(userId);
        return { success: true, data: watches };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Update watch
  ipcMain.handle(
    IPC_CHANNELS.WATCH_UPDATE,
    async (_event: IpcMainInvokeEvent, id: number, updates: Partial<WatchInput>) => {
      try {
        const watch = await watchService.update(id, updates);
        // Reschedule the watch with updated interval
        await jobScheduler.rescheduleWatch(id);
        return { success: true, data: watch };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Delete watch
  ipcMain.handle(
    IPC_CHANNELS.WATCH_DELETE,
    async (_event: IpcMainInvokeEvent, id: number) => {
      try {
        // Unschedule the watch first
        jobScheduler.unscheduleWatch(id);
        const result = await watchService.delete(id);
        return { success: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Activate watch
  ipcMain.handle(
    IPC_CHANNELS.WATCH_ACTIVATE,
    async (_event: IpcMainInvokeEvent, id: number) => {
      try {
        await watchService.activate(id);
        // Reschedule the watch
        await jobScheduler.rescheduleWatch(id);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Deactivate watch
  ipcMain.handle(
    IPC_CHANNELS.WATCH_DEACTIVATE,
    async (_event: IpcMainInvokeEvent, id: number) => {
      try {
        await watchService.deactivate(id);
        // Unschedule the watch
        jobScheduler.unscheduleWatch(id);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Execute watch immediately
  ipcMain.handle(
    IPC_CHANNELS.WATCH_EXECUTE,
    async (_event: IpcMainInvokeEvent, id: number) => {
      try {
        console.log(`[Watch Handler] Executing watch ${id}`);
        const result = await jobScheduler.executeWatchNow(id);
        console.log(`[Watch Handler] Watch ${id} execution result:`, JSON.stringify(result, null, 2));
        return { success: true, data: result };
      } catch (error: any) {
        console.error(`[Watch Handler] Watch ${id} execution error:`, error);
        return { success: false, error: error.message };
      }
    }
  );
}
