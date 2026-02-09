/**
 * Notification Dispatcher
 * Orchestrates sending notifications through all enabled providers
 */

import {
  NotificationChannel,
  NotificationMessage,
  NotificationDeliveryResult,
  TestConnectionResult,
  ProviderValidationResult,
} from '@shared/types';
import { BaseNotificationProvider } from './providers/base.provider';
import { SMTPEmailProvider } from './providers/email-smtp.provider';
import { NotificationProviderRepository } from '../../database/repositories/notification-provider.repository';
import { logger } from '../../utils/logger';

export interface DispatchResult {
  channel: NotificationChannel;
  result: NotificationDeliveryResult;
}

export class NotificationDispatcher {
  private providers: Map<NotificationChannel, BaseNotificationProvider> = new Map();
  private providerRepository: NotificationProviderRepository;

  constructor(providerRepository: NotificationProviderRepository) {
    this.providerRepository = providerRepository;
    this.initializeProviders();
  }

  /**
   * Initialize all available providers
   */
  private initializeProviders(): void {
    // Register SMTP Email provider
    const smtpProvider = new SMTPEmailProvider();
    this.providers.set(NotificationChannel.EMAIL_SMTP, smtpProvider);

    // Load configurations from database
    this.loadProviderConfigurations();

    logger.info('Notification dispatcher initialized with providers:',
      Array.from(this.providers.keys()));
  }

  /**
   * Load provider configurations from database
   */
  loadProviderConfigurations(): void {
    try {
      const dbProviders = this.providerRepository.findAll();

      for (const dbProvider of dbProviders) {
        const provider = this.providers.get(dbProvider.channel);
        if (provider) {
          provider.configure(dbProvider.config as Record<string, unknown>);
          provider.setEnabled(dbProvider.enabled);
          logger.debug(`Loaded configuration for ${dbProvider.channel}`, {
            enabled: dbProvider.enabled,
          });
        }
      }
    } catch (error) {
      logger.error('Error loading provider configurations:', error);
    }
  }

  /**
   * Dispatch a notification to all enabled providers
   */
  async dispatch(message: NotificationMessage): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];

    for (const [channel, provider] of this.providers) {
      if (!provider.isEnabled()) {
        logger.debug(`Skipping disabled provider: ${channel}`);
        continue;
      }

      // Validate configuration before sending
      const validation = provider.validate();
      if (!validation.valid) {
        logger.warn(`Provider ${channel} validation failed:`, validation.errors);
        results.push({
          channel,
          result: {
            success: false,
            error: `Configuration invalid: ${validation.errors.join(', ')}`,
          },
        });
        continue;
      }

      try {
        logger.info(`Dispatching notification via ${channel}:`, { title: message.title });
        const result = await provider.send(message);
        results.push({ channel, result });

        // Log the delivery to database
        this.providerRepository.logDelivery({
          providerChannel: channel,
          status: result.success ? 'sent' : 'failed',
          messageId: result.messageId,
          errorMessage: result.error,
          sentAt: result.success ? new Date() : undefined,
        });

        if (result.success) {
          logger.info(`Notification sent successfully via ${channel}`, {
            messageId: result.messageId,
          });
        } else {
          logger.error(`Failed to send notification via ${channel}:`, result.error);
        }
      } catch (error: any) {
        logger.error(`Error dispatching notification via ${channel}:`, error);
        results.push({
          channel,
          result: {
            success: false,
            error: error.message || 'Unknown error',
          },
        });

        // Log the failed delivery
        this.providerRepository.logDelivery({
          providerChannel: channel,
          status: 'failed',
          errorMessage: error.message || 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Get a specific provider
   */
  getProvider(channel: NotificationChannel): BaseNotificationProvider | undefined {
    return this.providers.get(channel);
  }

  /**
   * Get all registered providers
   */
  getAllProviders(): Map<NotificationChannel, BaseNotificationProvider> {
    return this.providers;
  }

  /**
   * Configure a specific provider
   */
  configureProvider(
    channel: NotificationChannel,
    config: Record<string, unknown>,
    enabled: boolean
  ): void {
    const provider = this.providers.get(channel);
    if (provider) {
      provider.configure(config);
      provider.setEnabled(enabled);
      logger.info(`Provider ${channel} configured`, { enabled });
    } else {
      logger.warn(`Provider not found: ${channel}`);
    }
  }

  /**
   * Test a provider's connection
   */
  async testProvider(channel: NotificationChannel): Promise<TestConnectionResult> {
    const provider = this.providers.get(channel);
    if (!provider) {
      return {
        success: false,
        message: 'Provider not found',
        error: `Unknown channel: ${channel}`,
      };
    }

    // Validate configuration first
    const validation = provider.validate();
    if (!validation.valid) {
      return {
        success: false,
        message: 'Configuration invalid',
        error: validation.errors.join(', '),
      };
    }

    try {
      return await provider.testConnection();
    } catch (error: any) {
      return {
        success: false,
        message: 'Test failed',
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Validate a provider's configuration
   */
  validateProvider(channel: NotificationChannel): ProviderValidationResult {
    const provider = this.providers.get(channel);
    if (!provider) {
      return {
        valid: false,
        errors: [`Unknown channel: ${channel}`],
      };
    }

    return provider.validate();
  }

  /**
   * Get provider status information
   */
  getProviderStatus(channel: NotificationChannel): {
    exists: boolean;
    enabled: boolean;
    valid: boolean;
    errors: string[];
  } {
    const provider = this.providers.get(channel);
    if (!provider) {
      return {
        exists: false,
        enabled: false,
        valid: false,
        errors: ['Provider not found'],
      };
    }

    const validation = provider.validate();
    return {
      exists: true,
      enabled: provider.isEnabled(),
      valid: validation.valid,
      errors: validation.errors,
    };
  }
}
