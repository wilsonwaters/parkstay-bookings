/**
 * Gmail OTP Service
 * Automated email retrieval and OTP/magic link extraction
 */

import { google } from 'googleapis';
import { OAuth2Handler } from './oauth2-handler';
import {
  EmailSearchCriteria,
  GmailMessage,
  OTPResult,
  EmailPollOptions,
  OAuth2Credentials,
} from '@shared/types/gmail.types';
import { logger } from '../../utils/logger';

export class GmailOTPService {
  private oauth2Handler: OAuth2Handler;
  private static instance: GmailOTPService;

  private constructor() {
    this.oauth2Handler = new OAuth2Handler();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): GmailOTPService {
    if (!GmailOTPService.instance) {
      GmailOTPService.instance = new GmailOTPService();
    }
    return GmailOTPService.instance;
  }

  /**
   * Set OAuth2 credentials
   */
  setCredentials(credentials: OAuth2Credentials): void {
    this.oauth2Handler.setCredentials(credentials);
  }

  /**
   * Get OAuth2 credentials
   */
  getCredentials(): OAuth2Credentials | null {
    return this.oauth2Handler.getCredentials();
  }

  /**
   * Authorize Gmail access
   */
  async authorize(): Promise<{ success: boolean; error?: string }> {
    const result = await this.oauth2Handler.authorize();
    return {
      success: result.success,
      error: result.error,
    };
  }

  /**
   * Check authorization status
   */
  isAuthorized(): boolean {
    return this.oauth2Handler.isAuthorized();
  }

  /**
   * Get authorization status details
   */
  getAuthStatus(): { isAuthorized: boolean; expiryDate?: number } {
    return this.oauth2Handler.getAuthStatus();
  }

  /**
   * Revoke authorization
   */
  async revokeAuthorization(): Promise<boolean> {
    return await this.oauth2Handler.revoke();
  }

  /**
   * Wait for email matching criteria and extract OTP/magic link
   * This is the main method that polls Gmail for new emails
   */
  async waitForEmail(
    fromEmail: string,
    subject: string,
    timeout: number = 60000
  ): Promise<OTPResult> {
    const options: EmailPollOptions = {
      fromEmail,
      subject,
      timeout,
      pollInterval: 2000,
      extractOTP: true,
      extractLink: true,
    };

    return await this.pollForEmail(options);
  }

  /**
   * Poll Gmail for emails matching criteria
   */
  private async pollForEmail(options: EmailPollOptions): Promise<OTPResult> {
    const { fromEmail, subject, timeout = 60000, pollInterval = 2000 } = options;

    const startTime = Date.now();
    const maxTime = startTime + timeout;

    logger.info(`Polling for email from ${fromEmail} with subject "${subject}"`);

    while (Date.now() < maxTime) {
      try {
        const result = await this.searchAndExtract({
          fromEmail,
          subject,
          afterDate: new Date(startTime),
          unreadOnly: true,
        });

        if (result.found) {
          logger.info('Email found and processed successfully');
          return result;
        }

        // Wait before next poll
        await this.sleep(pollInterval);
      } catch (error: any) {
        logger.error('Error polling for email:', error);

        // If authorization error, stop polling
        if (error.code === 401 || error.message?.includes('unauthorized')) {
          return {
            found: false,
          };
        }

        // Continue polling on other errors
        await this.sleep(pollInterval);
      }
    }

    logger.warn('Email polling timeout reached');
    return {
      found: false,
    };
  }

  /**
   * Search for emails and extract OTP/links
   */
  private async searchAndExtract(criteria: EmailSearchCriteria): Promise<OTPResult> {
    try {
      const auth = await this.oauth2Handler.getAuthorizedClient();
      if (!auth) {
        throw new Error('Not authorized. Please authorize Gmail access first.');
      }

      const gmail = google.gmail({ version: 'v1', auth });

      // Build search query
      let query = '';
      if (criteria.fromEmail) {
        query += `from:${criteria.fromEmail} `;
      }
      if (criteria.subject) {
        query += `subject:"${criteria.subject}" `;
      }
      if (criteria.afterDate) {
        const timestamp = Math.floor(criteria.afterDate.getTime() / 1000);
        query += `after:${timestamp} `;
      }
      if (criteria.unreadOnly) {
        query += 'is:unread ';
      }

      query = query.trim();

      logger.debug(`Gmail search query: ${query}`);

      // Search for messages
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 10,
      });

      const messages = response.data.messages;
      if (!messages || messages.length === 0) {
        return { found: false };
      }

      // Get the most recent message
      const messageId = messages[0].id;
      if (!messageId) {
        return { found: false };
      }

      const message = await this.getMessageDetails(gmail, messageId);
      if (!message) {
        return { found: false };
      }

      // Extract OTP or magic link from message body
      const extractionResult = this.extractOTPAndLink(message.body);

      return {
        found: extractionResult.code !== undefined || extractionResult.link !== undefined,
        code: extractionResult.code,
        link: extractionResult.link,
        message,
      };
    } catch (error: any) {
      logger.error('Error searching and extracting:', error);
      throw error;
    }
  }

  /**
   * Get detailed message information
   */
  private async getMessageDetails(gmail: any, messageId: string): Promise<GmailMessage | null> {
    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload.headers;

      // Extract headers
      const subject = headers.find((h: any) => h.name === 'Subject')?.value || '';
      const from = headers.find((h: any) => h.name === 'From')?.value || '';
      const date = headers.find((h: any) => h.name === 'Date')?.value || '';

      // Extract body
      let body = '';
      if (message.payload.body.data) {
        body = Buffer.from(message.payload.body.data, 'base64').toString('utf-8');
      } else if (message.payload.parts) {
        // Handle multipart messages
        for (const part of message.payload.parts) {
          if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
            if (part.body.data) {
              body += Buffer.from(part.body.data, 'base64').toString('utf-8');
            }
          }
        }
      }

      return {
        id: message.id,
        threadId: message.threadId,
        subject,
        from,
        date: new Date(date),
        body,
        snippet: message.snippet || '',
      };
    } catch (error: any) {
      logger.error('Error getting message details:', error);
      return null;
    }
  }

  /**
   * Extract OTP codes and magic links from email body
   */
  private extractOTPAndLink(body: string): { code?: string; link?: string } {
    const result: { code?: string; link?: string } = {};

    // Common OTP patterns
    const otpPatterns = [
      /\b(\d{4,8})\b/g, // 4-8 digit codes
      /\bcode:\s*(\d{4,8})\b/gi,
      /\bverification code:\s*(\d{4,8})\b/gi,
      /\bOTP:\s*(\d{4,8})\b/gi,
      /\bone-time password:\s*(\d{4,8})\b/gi,
    ];

    // Try to extract OTP code
    for (const pattern of otpPatterns) {
      const matches = body.match(pattern);
      if (matches && matches.length > 0) {
        // Get the first match and extract just the digits
        const match = matches[0];
        const codeMatch = match.match(/\d{4,8}/);
        if (codeMatch) {
          result.code = codeMatch[0];
          break;
        }
      }
    }

    // Common magic link patterns
    const linkPatterns = [
      /https?:\/\/[^\s<>"']+(?:login|verify|confirm|authenticate|magic|auth)[^\s<>"']*/gi,
      /https?:\/\/[^\s<>"']+(?:token|code)=[^\s<>"']*/gi,
    ];

    // Try to extract magic link
    for (const pattern of linkPatterns) {
      const matches = body.match(pattern);
      if (matches && matches.length > 0) {
        result.link = matches[0];
        break;
      }
    }

    // If no specific magic link pattern found, try to find any HTTPS link
    if (!result.link) {
      const genericLinkPattern = /https:\/\/[^\s<>"']+/gi;
      const matches = body.match(genericLinkPattern);
      if (matches && matches.length > 0) {
        // Get the first HTTPS link
        result.link = matches[0];
      }
    }

    return result;
  }

  /**
   * Get recent emails (for testing/debugging)
   */
  async getRecentEmails(maxResults: number = 10): Promise<GmailMessage[]> {
    try {
      const auth = await this.oauth2Handler.getAuthorizedClient();
      if (!auth) {
        throw new Error('Not authorized. Please authorize Gmail access first.');
      }

      const gmail = google.gmail({ version: 'v1', auth });

      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults,
      });

      const messages = response.data.messages || [];
      const detailedMessages: GmailMessage[] = [];

      for (const message of messages) {
        if (message.id) {
          const details = await this.getMessageDetails(gmail, message.id);
          if (details) {
            detailedMessages.push(details);
          }
        }
      }

      return detailedMessages;
    } catch (error: any) {
      logger.error('Error getting recent emails:', error);
      throw error;
    }
  }

  /**
   * Test email search (for debugging)
   */
  async testEmailSearch(fromEmail: string, subject: string): Promise<GmailMessage[]> {
    try {
      const auth = await this.oauth2Handler.getAuthorizedClient();
      if (!auth) {
        throw new Error('Not authorized. Please authorize Gmail access first.');
      }

      const gmail = google.gmail({ version: 'v1', auth });

      const query = `from:${fromEmail} subject:"${subject}"`;
      logger.debug(`Test search query: ${query}`);

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 5,
      });

      const messages = response.data.messages || [];
      const detailedMessages: GmailMessage[] = [];

      for (const message of messages) {
        if (message.id) {
          const details = await this.getMessageDetails(gmail, message.id);
          if (details) {
            detailedMessages.push(details);
          }
        }
      }

      return detailedMessages;
    } catch (error: any) {
      logger.error('Error in test search:', error);
      throw error;
    }
  }

  /**
   * Helper to sleep/delay
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
