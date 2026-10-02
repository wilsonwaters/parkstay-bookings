/**
 * NotificationService Unit Tests
 */

import { NotificationService } from '@main/services/notification/notification.service';
import { TestDatabaseHelper } from '@tests/utils/database-helper';
import { UserRepository } from '@main/database/repositories/UserRepository';
import { mockUserInput } from '@tests/fixtures/users';
import { mockWatch } from '@tests/fixtures/watches';
import { mockSiteSnipe } from '@tests/fixtures/site-sniper';
import { NotificationType } from '@shared/types/common.types';

describe('NotificationService', () => {
  let dbHelper: TestDatabaseHelper;
  let notificationService: NotificationService;
  let testUserId: number;

  beforeEach(async () => {
    dbHelper = new TestDatabaseHelper('notification-service');
    await dbHelper.setup();

    const userRepo = new UserRepository(dbHelper.getDb());
    const user = userRepo.create(mockUserInput.email, 'enc', 'key', 'iv', 'tag');
    testUserId = user.id;

    notificationService = new NotificationService();
  });

  afterEach(async () => {
    await dbHelper.teardown();
  });

  describe('notify', () => {
    it('should create a notification', async () => {
      const notification = await notificationService.notify({
        userId: testUserId,
        type: NotificationType.INFO,
        title: 'Test Notification',
        message: 'This is a test',
      });

      expect(notification).toBeDefined();
      expect(notification.id).toBeDefined();
      expect(notification.userId).toBe(testUserId);
      expect(notification.title).toBe('Test Notification');
      expect(notification.isRead).toBe(false);
    });
  });

  describe('notifyWatchFound', () => {
    it('should create watch found notification', async () => {
      const watch = { ...mockWatch, userId: testUserId };
      await notificationService.notifyWatchFound(watch, [
        { siteId: 'S1', siteName: 'Site 1', siteType: 'Unpowered' },
      ]);

      const notifications = await notificationService.getNotifications(testUserId);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe(NotificationType.WATCH_FOUND);
    });
  });

  describe('notifySnipeHeld', () => {
    it('should create snipe held notification', async () => {
      const snipe = { ...mockSiteSnipe, userId: testUserId };
      await notificationService.notifySnipeHeld(snipe);

      const notifications = await notificationService.getNotifications(testUserId);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe(NotificationType.SNIPE_HELD);
      expect(notifications[0].actionUrl).toBe(`/site-sniper/${snipe.id}`);
    });
  });

  describe('notifySnipeBooked', () => {
    it('should create snipe booked notification', async () => {
      const snipe = { ...mockSiteSnipe, userId: testUserId, bookedReference: 'PS0098765' };
      await notificationService.notifySnipeBooked(snipe);

      const notifications = await notificationService.getNotifications(testUserId);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe(NotificationType.SNIPE_BOOKED);
    });
  });

  describe('getUnreadNotifications', () => {
    it('should return only unread notifications', async () => {
      const notif1 = await notificationService.notify({
        userId: testUserId,
        type: NotificationType.INFO,
        title: 'Notification 1',
        message: 'Message 1',
      });

      await notificationService.notify({
        userId: testUserId,
        type: NotificationType.INFO,
        title: 'Notification 2',
        message: 'Message 2',
      });

      await notificationService.markAsRead(notif1.id);

      const unread = await notificationService.getUnreadNotifications(testUserId);
      expect(unread).toHaveLength(1);
      expect(unread[0].title).toBe('Notification 2');
    });
  });

  describe('getUnreadCount', () => {
    it('should return correct unread count', async () => {
      await notificationService.notify({
        userId: testUserId,
        type: NotificationType.INFO,
        title: 'N1',
        message: 'M1',
      });

      await notificationService.notify({
        userId: testUserId,
        type: NotificationType.INFO,
        title: 'N2',
        message: 'M2',
      });

      const count = await notificationService.getUnreadCount(testUserId);
      expect(count).toBe(2);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      await notificationService.notify({
        userId: testUserId,
        type: NotificationType.INFO,
        title: 'N1',
        message: 'M1',
      });

      await notificationService.notify({
        userId: testUserId,
        type: NotificationType.INFO,
        title: 'N2',
        message: 'M2',
      });

      await notificationService.markAllAsRead(testUserId);

      const unreadCount = await notificationService.getUnreadCount(testUserId);
      expect(unreadCount).toBe(0);
    });
  });
});
