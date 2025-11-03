import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { NotificationService } from '../../services/notification/notification.service';

/**
 * Register Notification IPC handlers
 */
export function registerNotificationHandlers(notificationService: NotificationService): void {
  // List notifications
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_LIST,
    async (_event: IpcMainInvokeEvent, userId: number, limit?: number) => {
      try {
        const notifications = await notificationService.getNotifications(userId, limit);
        return { success: true, data: notifications };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Mark notification as read
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_MARK_READ,
    async (_event: IpcMainInvokeEvent, id: number) => {
      try {
        await notificationService.markAsRead(id);
        return { success: true };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Delete notification
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_DELETE,
    async (_event: IpcMainInvokeEvent, id: number) => {
      try {
        const result = await notificationService.delete(id);
        return { success: result };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  // Delete all notifications
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_DELETE_ALL,
    async (_event: IpcMainInvokeEvent, userId: number) => {
      try {
        const count = await notificationService.deleteAll(userId);
        return { success: true, data: count };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );
}
