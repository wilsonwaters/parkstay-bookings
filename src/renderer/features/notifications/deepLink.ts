import { RelatedType } from '../../../shared/types/common.types';
import type { Notification } from '../../../shared/types/notification.types';
import { isAppLinkPath } from '../../../shared/utils/app-links';
import { ROUTES } from '../../app/routes';

/**
 * Where a notification leads inside WA Stay: its `actionUrl` when that is an allowed in-app
 * page (`/watches/:id`, `/site-sniper/:id`, `/bookings/:id`, `/settings/:section`), otherwise
 * the page of its watch, snipe or booking, otherwise nowhere. Never an external address.
 */
export function notificationLink(
  notification: Pick<Notification, 'actionUrl' | 'relatedType' | 'relatedId'>
): string | null {
  if (isAppLinkPath(notification.actionUrl)) return notification.actionUrl;
  const { relatedType, relatedId } = notification;
  if (relatedId === undefined || !Number.isInteger(relatedId) || relatedId < 1) return null;
  switch (relatedType) {
    case RelatedType.WATCH:
      return ROUTES.watchDetail(relatedId);
    case RelatedType.SNIPE:
      return ROUTES.snipeDetail(relatedId);
    case RelatedType.BOOKING:
      return ROUTES.bookingDetail(relatedId);
    default:
      return null;
  }
}
