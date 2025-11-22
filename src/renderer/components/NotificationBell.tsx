/**
 * Notification Bell Component
 * Displays a bell icon with unread notification count
 */

import React, { useState, useEffect, useRef } from 'react';
import { Notification } from '../../shared/types';
import NotificationList from './NotificationList';

const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();

    // Listen for new notifications
    window.api.on.notificationCreated(handleNewNotification);

    return () => {
      window.api.off.notificationCreated();
    };
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
      // Get current user ID - for now we'll use userId 1
      // In a real app, this would come from auth context
      const response = await window.api.notification.list(1, 20);
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
      const response = await window.api.notification.markRead(id);
      if (response.success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await window.api.notification.delete(id);
      if (response.success) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  };

  const handleClearAll = async () => {
    try {
      // Get current user ID - for now we'll use userId 1
      const response = await window.api.notification.deleteAll(1);
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
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <span className="text-2xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

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
