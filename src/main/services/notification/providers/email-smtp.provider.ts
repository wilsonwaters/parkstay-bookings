/**
 * SMTP Email Notification Provider
 * Sends notifications via email using SMTP (Nodemailer)
 */

import nodemailer, { Transporter } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  NotificationChannel,
  NotificationMessage,
  NotificationDeliveryResult,
  TestConnectionResult,
  ProviderValidationResult,
  SMTPConfig,
  SMTP_PRESETS,
  SMTPPreset,
} from '@shared/types';
import { BaseNotificationProvider } from './base.provider';

export class SMTPEmailProvider extends BaseNotificationProvider {
  private transporter: Transporter<SMTPTransport.SentMessageInfo> | null = null;

  constructor() {
    super(NotificationChannel.EMAIL_SMTP, 'Email (SMTP)');
  }

  /**
   * Get SMTP configuration
   */
  private getSmtpConfig(): SMTPConfig | null {
    const config = this.config as unknown as SMTPConfig;
    if (!config || !config.host || !config.auth?.user || !config.auth?.pass) {
      return null;
    }
    return config;
  }

  /**
   * Create or get the nodemailer transporter
   */
  private getTransporter(): Transporter<SMTPTransport.SentMessageInfo> {
    const config = this.getSmtpConfig();
    if (!config) {
      throw new Error('SMTP not configured');
    }

    // Always create a fresh transporter to ensure we're using current config
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
      },
      // Additional options for reliability
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 30000, // 30 seconds
    });

    return this.transporter;
  }

  /**
   * Configure the provider
   */
  configure(config: Record<string, unknown>): void {
    super.configure(config);
    // Reset transporter when config changes
    this.transporter = null;
  }

  /**
   * Send a notification via email
   */
  async send(message: NotificationMessage): Promise<NotificationDeliveryResult> {
    const config = this.getSmtpConfig();
    if (!config) {
      return {
        success: false,
        error: 'SMTP not configured',
      };
    }

    try {
      const transporter = this.getTransporter();
      const senderEmail = config.fromEmail || config.auth.user;
      const toEmail = config.toEmail || senderEmail;

      // Build email subject with app name and optional campground
      const subject = this.buildSubject(message);

      // Build email content
      const htmlContent = this.buildHtmlEmail(message);
      const textContent = this.buildTextEmail(message);

      const info = await transporter.sendMail({
        from: `"ParkStay Bookings App" <${senderEmail}>`,
        to: toEmail,
        subject,
        text: textContent,
        html: htmlContent,
      });

      this.log('info', `Email sent successfully to ${toEmail}`, {
        messageId: info.messageId,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error: any) {
      this.log('error', 'Failed to send email', error);
      return {
        success: false,
        error: error.message || 'Failed to send email',
      };
    }
  }

  /**
   * Test the SMTP connection
   */
  async testConnection(): Promise<TestConnectionResult> {
    const config = this.getSmtpConfig();
    if (!config) {
      return {
        success: false,
        message: 'SMTP not configured',
        error: 'Please configure SMTP settings first',
      };
    }

    try {
      const transporter = this.getTransporter();

      // Verify connection
      await transporter.verify();

      // Send a test email
      const senderEmail = config.fromEmail || config.auth.user;
      const toEmail = config.toEmail || senderEmail;
      const info = await transporter.sendMail({
        from: `"ParkStay Bookings App" <${senderEmail}>`,
        to: toEmail,
        subject: 'ParkStay Bookings App - Test Email',
        text: 'This is a test email from ParkStay Bookings App. If you received this, your email notifications are configured correctly!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2d5a27;">ParkStay Bookings App - Test Email</h2>
            <p>This is a test email from ParkStay Bookings App.</p>
            <p style="color: #28a745; font-weight: bold;">
              If you received this, your email notifications are configured correctly!
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
              This is an automated message from ParkStay Bookings App.
            </p>
          </div>
        `,
      });

      this.log('info', 'Test email sent successfully', { messageId: info.messageId });

      return {
        success: true,
        message: `Test email sent successfully to ${toEmail}`,
      };
    } catch (error: any) {
      this.log('error', 'SMTP connection test failed', error);

      // Provide helpful error messages
      let errorMessage = error.message || 'Connection test failed';

      if (error.code === 'EAUTH') {
        errorMessage = 'Authentication failed. Please check your email and app password.';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Connection refused. Please check the SMTP host and port.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timed out. Please check your network and SMTP settings.';
      }

      return {
        success: false,
        message: 'Connection test failed',
        error: errorMessage,
      };
    }
  }

  /**
   * Validate the SMTP configuration
   */
  validate(): ProviderValidationResult {
    const errors: string[] = [];
    const config = this.config as Partial<SMTPConfig>;

    if (!config) {
      return { valid: false, errors: ['No configuration provided'] };
    }

    if (!config.host) {
      errors.push('SMTP host is required');
    }

    if (!config.port || config.port < 1 || config.port > 65535) {
      errors.push('Valid SMTP port is required (1-65535)');
    }

    if (!config.auth?.user) {
      errors.push('Username is required');
    }

    // For Gmail/Outlook presets, username must be an email
    // For custom SMTP (or if preset is not set), username can be anything
    const isPresetProvider =
      config.preset === SMTPPreset.GMAIL || config.preset === SMTPPreset.OUTLOOK;

    if (isPresetProvider) {
      if (config.auth?.user && !this.isValidEmail(config.auth.user)) {
        errors.push('Invalid email address format');
      }
    } else {
      // Custom SMTP: validate fromEmail if provided
      if (config.fromEmail && !this.isValidEmail(config.fromEmail)) {
        errors.push('Invalid sender email address format');
      }
    }

    if (!config.auth?.pass) {
      errors.push('App password is required');
    }

    if (config.toEmail && !this.isValidEmail(config.toEmail)) {
      errors.push('Invalid recipient email address format');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Build email subject line
   */
  private buildSubject(message: NotificationMessage): string {
    const appName = 'ParkStay Bookings App';

    if (message.campgroundName) {
      return `${appName}: ${message.title} - ${message.campgroundName}`;
    }

    return `${appName}: ${message.title}`;
  }

  /**
   * Build HTML email content
   */
  private buildHtmlEmail(message: NotificationMessage): string {
    const actionButton = message.actionUrl
      ? `
        <a href="${message.actionUrl}"
           style="display: inline-block;
                  background-color: #2d5a27;
                  color: white;
                  padding: 12px 24px;
                  text-decoration: none;
                  border-radius: 4px;
                  margin-top: 16px;">
          View Details
        </a>
      `
      : '';

    const campgroundInfo = message.campgroundName
      ? `<p style="margin: 0 0 8px 0; color: #2d5a27; font-size: 14px; font-weight: bold;">
          Campground: ${this.escapeHtml(message.campgroundName)}
        </p>`
      : '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: white; border-radius: 8px; padding: 24px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <div style="border-bottom: 2px solid #2d5a27; padding-bottom: 16px; margin-bottom: 16px;">
                <h1 style="margin: 0; color: #2d5a27; font-size: 24px;">
                  ParkStay Bookings App
                </h1>
              </div>

              <h2 style="margin: 0 0 12px 0; color: #333; font-size: 20px;">
                ${this.escapeHtml(message.title)}
              </h2>

              ${campgroundInfo}

              <p style="margin: 0 0 16px 0; color: #555; font-size: 16px; line-height: 1.5;">
                ${this.escapeHtml(message.message)}
              </p>

              ${actionButton}

              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

              <p style="margin: 0; color: #999; font-size: 12px;">
                This is an automated notification from ParkStay Bookings App.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Build plain text email content
   */
  private buildTextEmail(message: NotificationMessage): string {
    let text = `ParkStay Bookings App\n\n`;
    text += `${message.title}\n\n`;

    if (message.campgroundName) {
      text += `Campground: ${message.campgroundName}\n\n`;
    }

    text += `${message.message}\n`;

    if (message.actionUrl) {
      text += `\nView details: ${message.actionUrl}\n`;
    }

    text += `\n---\nThis is an automated notification from ParkStay Bookings App.`;

    return text;
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  /**
   * Apply SMTP preset configuration
   */
  static applyPreset(
    preset: SMTPPreset,
    email: string,
    password: string,
    toEmail?: string
  ): SMTPConfig {
    const presetConfig = SMTP_PRESETS[preset];
    return {
      preset,
      host: presetConfig.host,
      port: presetConfig.port,
      secure: presetConfig.secure,
      auth: {
        user: email,
        pass: password,
      },
      toEmail: toEmail || email,
    };
  }
}
