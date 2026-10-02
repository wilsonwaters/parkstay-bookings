/**
 * Notifier Types
 * Types for the pluggable notifier system: outbound notification channels such as email
 * (SMTP). In WA Stay a "provider" is an accommodation source, never a notifier.
 */

/**
 * Supported notification channels
 */
export enum NotifierChannel {
  DESKTOP = 'desktop',
  EMAIL_SMTP = 'email_smtp',
  // Future channels
  // TELEGRAM = 'telegram',
  // DISCORD = 'discord',
}

/**
 * Notifier status
 */
export enum NotifierStatus {
  NOT_CONFIGURED = 'not_configured',
  CONFIGURED = 'configured',
  ERROR = 'error',
}

/**
 * SMTP notifier preset types
 */
export enum SMTPPreset {
  GMAIL = 'gmail',
  OUTLOOK = 'outlook',
  CUSTOM = 'custom',
}

/**
 * SMTP configuration
 */
export interface SMTPConfig {
  preset: SMTPPreset;
  host: string;
  port: number;
  secure: boolean; // true for SSL/TLS on port 465, false for STARTTLS on 587
  auth: {
    user: string; // Username for SMTP auth (email address for Gmail/Outlook, can be different for custom)
    pass: string; // App password (will be encrypted)
  };
  fromEmail?: string; // Sender email address (for custom SMTP where username != email, defaults to auth.user)
  toEmail?: string; // Recipient email (defaults to fromEmail or auth.user if not set)
}

/**
 * Notifier configuration stored in the `notifiers` table
 */
export interface Notifier {
  id: number;
  channel: NotifierChannel;
  displayName: string;
  enabled: boolean;
  config: SMTPConfig | Record<string, unknown>; // Notifier-specific config
  status: NotifierStatus;
  lastTestedAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating/updating a notifier
 */
export interface NotifierInput {
  channel: NotifierChannel;
  displayName: string;
  enabled?: boolean;
  config: SMTPConfig | Record<string, unknown>;
}

/**
 * Notifier configuration for SMTP Email
 */
export interface SmtpNotifierConfig {
  channel: NotifierChannel.EMAIL_SMTP;
  config: SMTPConfig;
}

/**
 * Notification message to be dispatched
 */
export interface NotificationMessage {
  title: string;
  message: string;
  actionUrl?: string;
  type?: string;
  campgroundName?: string; // For watch notifications
}

/**
 * Result of sending a notification through a notifier
 */
export interface NotificationDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Delivery log entry
 */
export interface NotificationDeliveryLog {
  id: number;
  notificationId?: number;
  notifierChannel: NotifierChannel;
  status: 'sent' | 'failed' | 'pending';
  messageId?: string;
  errorMessage?: string;
  sentAt?: Date;
  createdAt: Date;
}

/**
 * Input for creating a delivery log entry
 */
export interface NotificationDeliveryLogInput {
  notificationId?: number;
  notifierChannel: NotifierChannel;
  status: 'sent' | 'failed' | 'pending';
  messageId?: string;
  errorMessage?: string;
  sentAt?: Date;
}

/**
 * Test connection result
 */
export interface TestConnectionResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Notifier validation result
 */
export interface NotifierValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * SMTP preset configurations
 */
export const SMTP_PRESETS: Record<SMTPPreset, Omit<SMTPConfig, 'auth' | 'toEmail' | 'preset'>> = {
  [SMTPPreset.GMAIL]: {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Uses STARTTLS
  },
  [SMTPPreset.OUTLOOK]: {
    host: 'smtp.office365.com',
    port: 587,
    secure: false, // Uses STARTTLS
  },
  [SMTPPreset.CUSTOM]: {
    host: '',
    port: 587,
    secure: false,
  },
};
