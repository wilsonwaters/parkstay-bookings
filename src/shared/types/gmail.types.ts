/**
 * Gmail Service Types
 * Types for Gmail API integration and OTP extraction
 */

/**
 * OAuth2 credentials structure
 */
export interface OAuth2Credentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * OAuth2 tokens structure
 */
export interface OAuth2Tokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date?: number;
}

/**
 * Gmail authorization status
 */
export interface GmailAuthStatus {
  isAuthorized: boolean;
  email?: string;
  expiryDate?: number;
}

/**
 * Email search criteria
 */
export interface EmailSearchCriteria {
  fromEmail?: string;
  subject?: string;
  afterDate?: Date;
  unreadOnly?: boolean;
}

/**
 * Email message structure (simplified)
 */
export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: Date;
  body: string;
  snippet: string;
}

/**
 * OTP extraction result
 */
export interface OTPResult {
  found: boolean;
  code?: string;
  link?: string;
  message?: GmailMessage;
}

/**
 * Gmail service configuration
 */
export interface GmailConfig {
  credentials: OAuth2Credentials;
  scopes: string[];
}

/**
 * Email polling options
 */
export interface EmailPollOptions {
  fromEmail: string;
  subject: string;
  timeout?: number; // in milliseconds, default 60000 (1 minute)
  pollInterval?: number; // in milliseconds, default 2000 (2 seconds)
  extractOTP?: boolean; // default true
  extractLink?: boolean; // default true
}

/**
 * OAuth2 flow result
 */
export interface OAuth2FlowResult {
  success: boolean;
  tokens?: OAuth2Tokens;
  error?: string;
}
