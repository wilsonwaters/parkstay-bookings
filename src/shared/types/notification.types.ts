import { NotificationType, RelatedType } from './common.types';

export interface Notification {
  id: number;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: number;
  relatedType?: RelatedType;
  actionUrl?: string;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedId?: number;
  relatedType?: RelatedType;
  actionUrl?: string;
}
