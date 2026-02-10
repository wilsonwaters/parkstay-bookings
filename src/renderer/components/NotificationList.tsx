/**
 * Notification List Component
 * Displays a list of notifications in a dropdown
 */

import React from 'react';
import { Notification } from '../../shared/types';
import { format } from 'date-fns';

interface NotificationListProps {
  notifications: Notification[];
  isLoading: boolean;
  onMarkAsRead: (id: number) => void;
  onDelete: (id: number) => void;
  onClearAll: () => void;
  onRefresh: () => void;
}

const NotificationList: React.FC<NotificationListProps> = ({
  notifications,
  isLoading,
  onMarkAsRead,
  onDelete,
  onClearAll,
  onRefresh,
}) => {
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'watch_found':
        return '👁️';
      case 'stq_success':
        return '⚡';
      case 'booking_confirmed':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
        return 'ℹ';
      default:
        return '📢';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'watch_found':
      case 'stq_success':
      case 'booking_confirmed':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      case 'warning':
        return 'text-yellow-600';
      case 'info':
      default:
        return 'text-blue-600';
    }
  };

  return (
    <div className="flex flex-col max-h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="text-sm text-gray-600 hover:text-gray-900"
              disabled={isLoading}
            >
              {isLoading ? '...' : '🔄'}
            </button>
            {notifications.length > 0 && (
              <button onClick={onClearAll} className="text-sm text-red-600 hover:text-red-700">
                Clear All
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
            <p className="mt-2 text-sm text-gray-500">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-4xl mb-2">🔔</div>
            <p className="text-gray-500">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-4 hover:bg-gray-50 transition-colors ${
                  !notification.isRead ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`text-2xl ${getNotificationColor(notification.type)}`}>
                    {getNotificationIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-gray-900">{notification.title}</h4>
                      <button
                        onClick={() => onDelete(notification.id)}
                        className="text-gray-400 hover:text-gray-600 text-sm"
                      >
                        ✕
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500">
                        {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                      </span>
                      {!notification.isRead && (
                        <button
                          onClick={() => onMarkAsRead(notification.id)}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationList;
