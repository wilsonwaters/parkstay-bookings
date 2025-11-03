// Common types used across the application

export enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  PENDING = 'pending',
}

export enum WatchResult {
  FOUND = 'found',
  NOT_FOUND = 'not_found',
  ERROR = 'error',
}

export enum STQResult {
  SUCCESS = 'success',
  UNAVAILABLE = 'unavailable',
  ERROR = 'error',
}

export enum NotificationType {
  WATCH_FOUND = 'watch_found',
  STQ_SUCCESS = 'stq_success',
  BOOKING_CONFIRMED = 'booking_confirmed',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

export enum RelatedType {
  BOOKING = 'booking',
  WATCH = 'watch',
  STQ = 'stq',
}

export enum JobType {
  WATCH_POLL = 'watch_poll',
  STQ_CHECK = 'stq_check',
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
  STQ = 'stq',
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
  stq: {
    defaultInterval: number;
    maxAttempts: number;
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
