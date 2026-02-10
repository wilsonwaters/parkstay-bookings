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
  NotificationProvider,
  NotificationProviderInput,
  NotificationChannel,
  TestConnectionResult,
  QueueSession,
  QueueStatusEvent,
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

    list: (): Promise<APIResponse<Booking[]>> => ipcRenderer.invoke(IPC_CHANNELS.BOOKING_LIST),

    update: (id: number, updates: Partial<BookingInput>): Promise<APIResponse<Booking>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_UPDATE, id, updates),

    delete: (id: number): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_DELETE, id),

    sync: (id: number): Promise<APIResponse<Booking>> =>
      ipcRenderer.invoke(IPC_CHANNELS.BOOKING_SYNC, id),

    syncAll: (): Promise<APIResponse<boolean>> => ipcRenderer.invoke(IPC_CHANNELS.BOOKING_SYNC_ALL),

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

  // ParkStay APIs
  parkstay: {
    searchCampgrounds: (query: string): Promise<APIResponse<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PARKSTAY_SEARCH_CAMPGROUNDS, query),

    getAllCampgrounds: (): Promise<APIResponse<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PARKSTAY_GET_ALL_CAMPGROUNDS),

    checkAvailability: (
      campgroundId: string,
      params: {
        arrivalDate: string;
        departureDate: string;
        numGuests: number;
        siteType?: string;
      }
    ): Promise<APIResponse<any>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PARKSTAY_CHECK_AVAILABILITY, campgroundId, params),
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

  // Notification Provider APIs
  notificationProvider: {
    list: (): Promise<APIResponse<NotificationProvider[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_LIST),

    get: (channel: NotificationChannel): Promise<APIResponse<NotificationProvider | null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_GET, channel),

    configure: (input: NotificationProviderInput): Promise<APIResponse<NotificationProvider>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_CONFIGURE, input),

    enable: (channel: NotificationChannel): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_ENABLE, channel),

    disable: (channel: NotificationChannel): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_DISABLE, channel),

    test: (channel: NotificationChannel): Promise<APIResponse<TestConnectionResult>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDER_TEST, channel),
  },

  // Updater APIs
  updater: {
    checkForUpdates: (): Promise<APIResponse<any>> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),

    downloadUpdate: (): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),

    installUpdate: (): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL),

    getStatus: (): Promise<APIResponse<any>> => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_GET_STATUS),
  },

  // App APIs
  app: {
    getInfo: (): Promise<APIResponse<any>> => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_INFO),

    openLogsFolder: (): Promise<APIResponse<boolean>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_LOGS_FOLDER),
  },

  // Queue APIs
  queue: {
    check: (): Promise<APIResponse<QueueSession>> => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_CHECK),

    wait: (): Promise<APIResponse<QueueSession>> => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_WAIT),

    getStatus: (): Promise<
      APIResponse<{
        session: QueueSession | null;
        isActive: boolean;
        isExpired: boolean;
        isWaiting: boolean;
        estimatedWait: string;
        expiryRemaining: string;
      }>
    > => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_GET_STATUS),

    clear: (): Promise<APIResponse<void>> => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_CLEAR),
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

    queueStatusUpdate: (callback: (event: QueueStatusEvent) => void) => {
      ipcRenderer.on(IPC_CHANNELS.QUEUE_STATUS_UPDATE, (_event, data) => callback(data));
    },

    updateAvailable: (callback: (data: { version: string; releaseNotes?: string }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_AVAILABLE, (_event, data) => callback(data));
    },

    updateDownloaded: (callback: (data: { version: string }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_DOWNLOADED, (_event, data) => callback(data));
    },

    updateProgress: (
      callback: (data: {
        percent: number;
        bytesPerSecond: number;
        transferred: number;
        total: number;
      }) => void
    ) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_PROGRESS, (_event, data) => callback(data));
    },

    updateError: (callback: (data: { error: string }) => void) => {
      ipcRenderer.on(IPC_CHANNELS.UPDATE_ERROR, (_event, data) => callback(data));
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

    queueStatusUpdate: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.QUEUE_STATUS_UPDATE);
    },

    updateAvailable: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_AVAILABLE);
    },

    updateDownloaded: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_DOWNLOADED);
    },

    updateProgress: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_PROGRESS);
    },

    updateError: () => {
      ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATE_ERROR);
    },
  },
};

// Expose API to renderer
console.log('[Preload] About to expose API to window.api');
contextBridge.exposeInMainWorld('api', api);
console.log('[Preload] API exposed successfully');

// Export type for TypeScript
export type API = typeof api;
