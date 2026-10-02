// Common types used across the application

export enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
}

export enum WatchResult {
  FOUND = 'found',
  NOT_FOUND = 'not_found',
  PARTIAL_FOUND = 'partial_found',
  ERROR = 'error',
}

export enum SnipeResult {
  PENDING = 'pending',
  HELD = 'held', // temp hold placed, awaiting payment
  BOOKED = 'booked', // user completed payment (confirmed later)
  UNAVAILABLE = 'unavailable',
  TOO_EARLY = 'too_early', // not open yet (toofar/closed)
  QUEUE_FULL = 'queue_full',
  EXPIRED = 'expired', // window/hold expired
  ERROR = 'error',
}

export enum SnipeReleaseMode {
  DAILY_ROLLOVER = 'daily_rollover', // non-Ningaloo midnight AWST rollover
  SCHEDULED = 'scheduled', // explicit release datetime (Ningaloo 10:00 first Tue)
  CANCELLATION = 'cancellation', // no fixed release; poll for freed site
}

export enum SnipeStatus {
  ARMED = 'armed', // scheduled, waiting for release window
  WAITING_RELEASE = 'waiting_release',
  QUEUEING = 'queueing', // establishing/holding queue session
  SNIPING = 'sniping', // tight-polling availability
  HELD = 'held', // hold placed, awaiting user payment
  BOOKED = 'booked',
  FAILED = 'failed',
  EXPIRED = 'expired',
  DISABLED = 'disabled',
}

export enum NotificationType {
  WATCH_FOUND = 'watch_found',
  SNIPE_HELD = 'snipe_held',
  SNIPE_BOOKED = 'snipe_booked',
  BOOKING_CONFIRMED = 'booking_confirmed',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export enum RelatedType {
  BOOKING = 'booking',
  WATCH = 'watch',
  SNIPE = 'snipe',
}

export enum JobType {
  WATCH_POLL = 'watch_poll',
  SNIPE = 'snipe',
  CLEANUP = 'cleanup',
}

export enum JobStatus {
  SUCCESS = 'success',
  FAILURE = 'failure',
  ERROR = 'error',
}

export enum SettingValueType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
}

export enum SettingCategory {
  GENERAL = 'general',
  NOTIFICATIONS = 'notifications',
  WATCHES = 'watches',
  SNIPER = 'sniper',
  UI = 'ui',
  ADVANCED = 'advanced',
}

// Base types
export interface User {
  id: number;
  email: string;
  encryptedPassword: string;
  encryptionKey: string;
  encryptionIv: string;
  encryptionAuthTag: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export interface UserCredentials {
  email: string;
  password: string;
}

export interface JobLog {
  id: number;
  jobType: JobType;
  jobId: number;
  status: JobStatus;
  message?: string;
  errorDetails?: string;
  durationMs?: number;
  createdAt: Date;
}

export interface JobLogInput {
  jobType: JobType;
  jobId: number;
  status: JobStatus;
  message?: string;
  errorDetails?: string;
  durationMs?: number;
}

export interface Setting {
  key: string;
  value: string;
  valueType: SettingValueType;
  category: SettingCategory;
  description?: string;
  updatedAt: Date;
}

export interface AppSettings {
  general: {
    launchOnStartup: boolean;
    minimizeToTray: boolean;
    checkForUpdates: boolean;
  };
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    soundFile: string;
  };
  watches: {
    defaultInterval: number;
    maxConcurrent: number;
    autoBookEnabled: boolean;
  };
  siteSniper: {
    defaultPollIntervalMs: number;
    defaultLeadTimeSeconds: number;
    enabled: boolean;
  };
  ui: {
    theme: 'light' | 'dark' | 'system';
    language: string;
    dateFormat: string;
  };
  advanced: {
    logLevel: 'error' | 'warn' | 'info' | 'debug';
    databasePath: string;
    maxLogSize: number;
  };
}
