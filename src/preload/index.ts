/**
 * Preload Script
 * Exposes secure API to renderer process via context bridge
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/constants/ipc-channels';
import {
  UserInput,
  UserCredentials,
  BookingInput,
  Booking,
  WatchInput,
  Watch,
  STQInput,
  SkipTheQueueEntry,
  Notification,
  APIResponse,
  SettingValueType,
  SettingCategory,
  OAuth2Credentials,
  GmailAuthStatus,
  OTPResult,
  GmailMessage,
} from '../shared/types';

// Define the API that will be exposed to the renderer
const api = {
  // Authentication APIs
  auth: {
    storeCredentials: (credentials: UserInput): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_STORE_CREDENTIALS, credentials),

    getCredentials: (): Promise<APIResponse<UserCredentials | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_CREDENTIALS),

    updateCredentials: (email: string, newPassword: string): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_UPDATE_CREDENTIALS, email, newPassword),

    deleteCredentials: (): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_DELETE_CREDENTIALS),

    validateSession: (): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_VALIDATE_SESSION),
  },

  // Booking APIs
  booking: {
    create: (input: BookingInput): Promise<APIResponse<Booking>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_CREATE, input),

    get: (id: number): Promise<APIResponse<Booking | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_GET, id),

    list: (): Promise<APIResponse<Booking[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_LIST),

    update: (id: number, updates: Partial<BookingInput>): Promise<APIResponse<Booking>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_UPDATE, id, updates),

    delete: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_DELETE, id),

    sync: (id: number): Promise<APIResponse<Booking>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_SYNC, id),

    syncAll: (): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_SYNC_ALL),

    import: (bookingReference: string): Promise<APIResponse<Booking>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_IMPORT, bookingReference),
  },

  // Settings APIs
  settings: {
    get: (key: string): Promise<APIResponse<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),

    set: (
      key: string,
      value: any,
      valueType: SettingValueType,
      category: SettingCategory
    ): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value, valueType, category),

    getAll: (): Promise<APIResponse<Record<string, any>>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),
  },

  // Watch APIs
  watch: {
    create: (userId: number, input: WatchInput): Promise<APIResponse<Watch>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_CREATE, userId, input),

    get: (id: number): Promise<APIResponse<Watch | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_GET, id),

    list: (userId: number): Promise<APIResponse<Watch[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_LIST, userId),

    update: (id: number, updates: Partial<WatchInput>): Promise<APIResponse<Watch>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_UPDATE, id, updates),

    delete: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_DELETE, id),

    activate: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_ACTIVATE, id),

    deactivate: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_DEACTIVATE, id),

    execute: (id: number): Promise<APIResponse<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.WATCH_EXECUTE, id),
  },

  // Skip The Queue APIs
  stq: {
    create: (userId: number, input: STQInput): Promise<APIResponse<SkipTheQueueEntry>> =>
      ipcRenderer.invoke(IPC_CHANNELS.STQ_CREATE, userId, input),

    get: (id: number): Promise<APIResponse<SkipTheQueueEntry | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.STQ_GET, id),

    list: (userId: number): Promise<APIResponse<SkipTheQueueEntry[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.STQ_LIST, userId),

    update: (id: number, updates: Partial<STQInput>): Promise<APIResponse<SkipTheQueueEntry>> =>
      ipcRenderer.invoke(IPC_CHANNELS.STQ_UPDATE, id, updates),

    delete: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.STQ_DELETE, id),

    activate: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.STQ_ACTIVATE, id),

    deactivate: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.STQ_DEACTIVATE, id),

    execute: (id: number): Promise<APIResponse<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.STQ_EXECUTE, id),
  },

  // Notification APIs
  notification: {
    list: (userId: number, limit?: number): Promise<APIResponse<Notification[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_LIST, userId, limit),

    markRead: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_MARK_READ, id),

    delete: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_DELETE, id),

    deleteAll: (userId: number): Promise<APIResponse<number>> =>
      ipcRenderer.invoke(IPC_CHANNELS.NOTIFICATION_DELETE_ALL, userId),
  },

  // Gmail APIs
  gmail: {
    setCredentials: (credentials: OAuth2Credentials): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GMAIL_SET_CREDENTIALS, credentials),

    getCredentials: (): Promise<APIResponse<OAuth2Credentials | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GMAIL_GET_CREDENTIALS),

    authorize: (): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GMAIL_AUTHORIZE),

    checkAuthStatus: (): Promise<APIResponse<GmailAuthStatus>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GMAIL_CHECK_AUTH_STATUS),

    revokeAuth: (): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GMAIL_REVOKE_AUTH),

    waitForEmail: (
      fromEmail: string,
      subject: string,
      timeout?: number
    ): Promise<APIResponse<OTPResult>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GMAIL_WAIT_FOR_EMAIL, fromEmail, subject, timeout),

    getRecentEmails: (maxResults?: number): Promise<APIResponse<GmailMessage[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GMAIL_GET_RECENT_EMAILS, maxResults),

    testSearch: (fromEmail: string, subject: string): Promise<APIResponse<GmailMessage[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GMAIL_TEST_SEARCH, fromEmail, subject),
  },

  // Event listeners
  on: {
    bookingUpdated: (callback: (booking: Booking) => void) => {
      ipcRenderer.on(IPC_CHANNELS.BOOKING_UPDATED, (_event, booking) => callback(booking));
    },

    notificationCreated: (callback: (notification: any) => void) => {
      ipcRenderer.on(IPC_CHANNELS.NOTIFICATION_CREATED, (_event, notification) =>
        callback(notification)
      );
    },

    watchResult: (callback: (result: any) => void) => {
      ipcRenderer.on(IPC_CHANNELS.WATCH_RESULT, (_event, result) => callback(result));
    },

    stqResult: (callback: (result: any) => void) => {
      ipcRenderer.on(IPC_CHANNELS.STQ_RESULT, (_event, result) => callback(result));
    },
  },

  // Remove event listeners
  off: {
    bookingUpdated: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.BOOKING_UPDATED);
    },

    notificationCreated: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.NOTIFICATION_CREATED);
    },

    watchResult: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.WATCH_RESULT);
    },

    stqResult: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.STQ_RESULT);
    },
  },
};

// Expose API to renderer
console.log('[Preload] About to expose API to window.api');
contextBridge.exposeInMainWorld('api', api);
console.log('[Preload] API exposed successfully');

// Export type for TypeScript
export type API = typeof api;
