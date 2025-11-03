/**
 * IPC Channel Constants
 * Centralized definition of all IPC channels used for communication
 * between main and renderer processes.
 */

export const IPC_CHANNELS = {
  // Authentication
  AUTH_STORE_CREDENTIALS: 'auth:store-credentials',
  AUTH_GET_CREDENTIALS: 'auth:get-credentials',
  AUTH_UPDATE_CREDENTIALS: 'auth:update-credentials',
  AUTH_DELETE_CREDENTIALS: 'auth:delete-credentials',
  AUTH_VALIDATE_SESSION: 'auth:validate-session',

  // Bookings
  BOOKING_CREATE: 'booking:create',
  BOOKING_GET: 'booking:get',
  BOOKING_LIST: 'booking:list',
  BOOKING_UPDATE: 'booking:update',
  BOOKING_DELETE: 'booking:delete',
  BOOKING_SYNC: 'booking:sync',
  BOOKING_SYNC_ALL: 'booking:sync-all',
  BOOKING_IMPORT: 'booking:import',

  // Watches
  WATCH_CREATE: 'watch:create',
  WATCH_GET: 'watch:get',
  WATCH_LIST: 'watch:list',
  WATCH_UPDATE: 'watch:update',
  WATCH_DELETE: 'watch:delete',
  WATCH_ACTIVATE: 'watch:activate',
  WATCH_DEACTIVATE: 'watch:deactivate',
  WATCH_EXECUTE: 'watch:execute',

  // Skip The Queue
  STQ_CREATE: 'stq:create',
  STQ_GET: 'stq:get',
  STQ_LIST: 'stq:list',
  STQ_UPDATE: 'stq:update',
  STQ_DELETE: 'stq:delete',
  STQ_ACTIVATE: 'stq:activate',
  STQ_DEACTIVATE: 'stq:deactivate',
  STQ_EXECUTE: 'stq:execute',

  // Notifications
  NOTIFICATION_LIST: 'notification:list',
  NOTIFICATION_MARK_READ: 'notification:mark-read',
  NOTIFICATION_DELETE: 'notification:delete',
  NOTIFICATION_DELETE_ALL: 'notification:delete-all',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  // Events (main -> renderer)
  NOTIFICATION_CREATED: 'notification:created',
  BOOKING_UPDATED: 'booking:updated',
  WATCH_RESULT: 'watch:result',
  STQ_RESULT: 'stq:result',
} as const;

export type IPCChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];
