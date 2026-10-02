import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { SiteSniperService } from '../../services/sitesniper/sitesniper.service';
import { SiteSnipeInput } from '@shared/types';
import { JobScheduler } from '../../scheduler/job-scheduler';

/**
 * Register Site Sniper IPC handlers
 */
export function registerSiteSniperHandlers(
  siteSniperService: SiteSniperService,
  jobScheduler: JobScheduler
): void {
  // Create snipe
  ipcMain.handle(
    IPC_CHANNELS.SNIPE_CREATE,
    async (_event: IpcMainInvokeEvent, userId: number, input: SiteSnipeInput) => {
      try {
        const snipe = await siteSniperService.create(userId, input);
        // Schedule the snipe
        jobScheduler.scheduleSnipe(snipe);
        return { success: true, data: snipe };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Get snipe
  ipcMain.handle(IPC_CHANNELS.SNIPE_GET, async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const snipe = await siteSniperService.get(id);
      return { success: true, data: snipe };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // List snipes
  ipcMain.handle(IPC_CHANNELS.SNIPE_LIST, async (_event: IpcMainInvokeEvent, userId: number) => {
    try {
      const snipes = await siteSniperService.list(userId);
      return { success: true, data: snipes };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Update snipe
  ipcMain.handle(
    IPC_CHANNELS.SNIPE_UPDATE,
    async (_event: IpcMainInvokeEvent, id: number, updates: Partial<SiteSnipeInput>) => {
      try {
        const snipe = await siteSniperService.update(id, updates);
        // Reschedule the snipe with updated timing
        await jobScheduler.rescheduleSnipe(id);
        return { success: true, data: snipe };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Delete snipe
  ipcMain.handle(IPC_CHANNELS.SNIPE_DELETE, async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      // Unschedule the snipe first
      jobScheduler.unscheduleSnipe(id);
      const result = await siteSniperService.delete(id);
      return { success: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Activate snipe
  ipcMain.handle(IPC_CHANNELS.SNIPE_ACTIVATE, async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      await siteSniperService.activate(id);
      // Reschedule the snipe
      await jobScheduler.rescheduleSnipe(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Deactivate snipe
  ipcMain.handle(IPC_CHANNELS.SNIPE_DEACTIVATE, async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      await siteSniperService.deactivate(id);
      // Unschedule the snipe
      jobScheduler.unscheduleSnipe(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Execute snipe immediately
  ipcMain.handle(IPC_CHANNELS.SNIPE_EXECUTE, async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const result = await jobScheduler.executeSnipeNow(id);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
