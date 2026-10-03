/**
 * Notification Bell Component
 * Displays a bell icon with unread notification count.
 * The trigger is the D2 IconButton; the dropdown list stays legacy until U5 rebuilds it.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { Notification } from '../../shared/types';
import NotificationList from './NotificationList';
import { IconButton } from './ui';

const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();

    // Listen for new notifications
    return window.api.events.on('notification:created', handleNewNotification);
  }, []);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const loadNotifications = async () => {
    try {
      setIsLoading(true);
      const response = await window.api.notifications.list(20);
      if (response.success && response.data) {
        setNotifications(response.data);
      }
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewNotification = (notification: Notification) => {
    setNotifications((prev) => [notification, ...prev]);
  };

  const handleMarkAsRead = async (id: number) => {
    try {
      const response = await window.api.notifications.markRead(id);
      if (response.success) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await window.api.notifications.delete(id);
      if (response.success) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const handleClearAll = async () => {
    try {
      const response = await window.api.notifications.clearAll();
      if (response.success) {
        setNotifications([]);
      }
    } catch (error) {
      console.error('Failed to clear all notifications:', error);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* The count is in the name ("Notifications, 3 unread"), so the badge is decorative. */}
      <IconButton
        label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
        icon={
          <>
            <Bell />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                data-testid="notification-badge"
                className="pointer-events-none absolute right-0.5 top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-accent px-1 text-[0.6875rem] font-semibold leading-none tabular-nums text-accent-fg ring-2 ring-surface"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </>
        }
      />

      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
          <NotificationList
            notifications={notifications}
            isLoading={isLoading}
            onMarkAsRead={handleMarkAsRead}
            onDelete={handleDelete}
            onClearAll={handleClearAll}
            onRefresh={loadNotifications}
          />
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
