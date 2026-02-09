/**
 * Base Notification Provider
 * Abstract base class for all notification providers
 */

import {
  NotificationChannel,
  NotificationMessage,
  NotificationDeliveryResult,
  TestConnectionResult,
  ProviderValidationResult,
} from '@shared/types';
import { logger } from '../../../utils/logger';

export abstract class BaseNotificationProvider {
  protected channel: NotificationChannel;
  protected displayName: string;
  protected enabled: boolean = false;
  protected config: Record<string, unknown> = {};

  constructor(channel: NotificationChannel, displayName: string) {
    this.channel = channel;
    this.displayName = displayName;
  }

  /**
   * Get the channel identifier
   */
  getChannel(): NotificationChannel {
    return this.channel;
  }

  /**
   * Get the display name
   */
  getDisplayName(): string {
    return this.displayName;
  }

  /**
   * Check if provider is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Set enabled status
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Configure the provider with settings
   */
  configure(config: Record<string, unknown>): void {
    this.config = config;
  }

  /**
   * Get current configuration
   */
  getConfig(): Record<string, unknown> {
    return this.config;
  }

  /**
   * Send a notification
   * Must be implemented by each provider
   */
  abstract send(message: NotificationMessage): Promise<NotificationDeliveryResult>;

  /**
   * Test the connection/configuration
   * Must be implemented by each provider
   */
  abstract testConnection(): Promise<TestConnectionResult>;

  /**
   * Validate the configuration
   * Must be implemented by each provider
   */
  abstract validate(): ProviderValidationResult;

  /**
   * Log a message with provider context
   */
  protected log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
    const prefix = `[${this.displayName}]`;
    switch (level) {
      case 'info':
        logger.info(`${prefix} ${message}`, data);
        break;
      case 'warn':
        logger.warn(`${prefix} ${message}`, data);
        break;
      case 'error':
        logger.error(`${prefix} ${message}`, data);
        break;
      case 'debug':
        logger.debug(`${prefix} ${message}`, data);
        break;
    }
  }
}
