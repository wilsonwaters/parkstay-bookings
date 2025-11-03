import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { STQService } from '../../services/stq/stq.service';
import { STQInput } from '@shared/types';
import { JobScheduler } from '../../scheduler/job-scheduler';

/**
 * Register STQ IPC handlers
 */
export function registerSTQHandlers(stqService: STQService, jobScheduler: JobScheduler): void {
  // Create STQ entry
  ipcMain.handle(
    IPC_CHANNELS.STQ_CREATE,
    async (_event: IpcMainInvokeEvent, userId: number, input: STQInput) => {
      try {
        const entry = await stqService.create(userId, input);
        // Schedule the STQ entry
        jobScheduler.scheduleSTQ(entry);
        return { success: true, data: entry };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Get STQ entry
  ipcMain.handle(IPC_CHANNELS.STQ_GET, async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const entry = await stqService.get(id);
      return { success: true, data: entry };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // List STQ entries
  ipcMain.handle(
    IPC_CHANNELS.STQ_LIST,
    async (_event: IpcMainInvokeEvent, userId: number) => {
      try {
        const entries = await stqService.list(userId);
        return { success: true, data: entries };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Update STQ entry
  ipcMain.handle(
    IPC_CHANNELS.STQ_UPDATE,
    async (_event: IpcMainInvokeEvent, id: number, updates: Partial<STQInput>) => {
      try {
        const entry = await stqService.update(id, updates);
        // Reschedule the STQ entry with updated interval
        await jobScheduler.rescheduleSTQ(id);
        return { success: true, data: entry };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Delete STQ entry
  ipcMain.handle(IPC_CHANNELS.STQ_DELETE, async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      // Unschedule the STQ entry first
      jobScheduler.unscheduleSTQ(id);
      const result = await stqService.delete(id);
      return { success: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Activate STQ entry
  ipcMain.handle(
    IPC_CHANNELS.STQ_ACTIVATE,
    async (_event: IpcMainInvokeEvent, id: number) => {
      try {
        await stqService.activate(id);
        // Reschedule the STQ entry
        await jobScheduler.rescheduleSTQ(id);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Deactivate STQ entry
  ipcMain.handle(
    IPC_CHANNELS.STQ_DEACTIVATE,
    async (_event: IpcMainInvokeEvent, id: number) => {
      try {
        await stqService.deactivate(id);
        // Unschedule the STQ entry
        jobScheduler.unscheduleSTQ(id);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Execute STQ entry immediately
  ipcMain.handle(IPC_CHANNELS.STQ_EXECUTE, async (_event: IpcMainInvokeEvent, id: number) => {
    try {
      const result = await jobScheduler.executeSTQNow(id);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
