/**
 * OAuth2 Handler
 * Manages OAuth2 authentication flow for Gmail API
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import Store from 'electron-store';
import { shell } from 'electron';
import { OAuth2Credentials, OAuth2Tokens, OAuth2FlowResult } from '@shared/types/gmail.types';
import type { GmailCredentialStatus } from '@shared/contracts/gmail';
import { logger } from '../../utils/logger';
import { DEFAULT_FLOW_TIMEOUT_MS, runLoopbackFlow } from './loopback-flow';

const STORAGE_KEY = 'gmail_oauth_tokens';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

interface StoreSchema {
  gmail_oauth_tokens?: OAuth2Tokens;
  /** Legacy (v1) entries also carry a `redirectUri`, which is ignored. */
  gmail_credentials?: OAuth2Credentials;
}

export interface OAuth2HandlerOptions {
  /** Opens the consent page in the system browser. Defaults to `shell.openExternal`. */
  openExternal?: (url: string) => Promise<void>;
  /** Builds the OAuth client. Defaults to googleapis' `OAuth2Client`. */
  createClient?: (credentials: OAuth2Credentials) => OAuth2Client;
  /** How long a sign-in waits for the browser. Defaults to 5 minutes. */
  flowTimeoutMs?: number;
}

/** The client ID and secret only: a legacy stored `redirectUri` is dropped, never used. */
function clientCredentials({ clientId, clientSecret }: OAuth2Credentials): OAuth2Credentials {
  return { clientId, clientSecret };
}

export class OAuth2Handler {
  private store: Store<StoreSchema>;
  private oauth2Client: OAuth2Client | null = null;
  private credentials: OAuth2Credentials | null = null;
  private readonly openExternal: (url: string) => Promise<void>;
  private readonly createClient: (credentials: OAuth2Credentials) => OAuth2Client;
  private readonly flowTimeoutMs: number;
  private authorizing = false;

  constructor(options: OAuth2HandlerOptions = {}) {
    this.store = new Store<StoreSchema>({
      name: 'gmail-oauth',
      encryptionKey: 'parkstay-gmail-oauth-encryption-key',
    });
    this.openExternal = options.openExternal ?? ((url) => shell.openExternal(url));
    // No redirect URI: each sign-in passes its own loopback address
    this.createClient =
      options.createClient ??
      ((credentials) => new google.auth.OAuth2(credentials.clientId, credentials.clientSecret));
    this.flowTimeoutMs = options.flowTimeoutMs ?? DEFAULT_FLOW_TIMEOUT_MS;
  }

  /**
   * Set OAuth2 credentials (Client ID and Secret from Google Cloud Console)
   */
  setCredentials(credentials: OAuth2Credentials): void {
    this.credentials = clientCredentials(credentials);
    this.store.set('gmail_credentials', this.credentials);

    this.oauth2Client = this.createClient(this.credentials);

    // Load existing tokens if available
    const tokens = this.getStoredTokens();
    if (tokens) {
      this.oauth2Client.setCredentials(tokens);
    }

    logger.info('OAuth2 credentials set successfully');
  }

  /**
   * Get stored credentials, secret included. Main process only: never return this over IPC.
   */
  getCredentials(): OAuth2Credentials | null {
    if (this.credentials) {
      return this.credentials;
    }

    const stored = this.store.get('gmail_credentials');
    if (stored) {
      this.credentials = clientCredentials(stored);
      return this.credentials;
    }

    return null;
  }

  /**
   * What the renderer may see: the client ID and whether a secret is stored.
   */
  getCredentialStatus(): GmailCredentialStatus | null {
    const credentials = this.getCredentials();
    if (!credentials) return null;
    return { clientId: credentials.clientId, hasClientSecret: credentials.clientSecret !== '' };
  }

  /**
   * Initialize OAuth2 client from stored credentials
   */
  private initializeClient(): boolean {
    const credentials = this.getCredentials();
    if (!credentials) {
      logger.warn('No OAuth2 credentials found');
      return false;
    }

    this.oauth2Client = this.createClient(credentials);

    const tokens = this.getStoredTokens();
    if (tokens) {
      this.oauth2Client.setCredentials(tokens);
    }

    return true;
  }

  /**
   * Start OAuth2 authorization flow. Only one sign-in runs at a time: a second call while
   * one is waiting for the browser is rejected.
   */
  async authorize(): Promise<OAuth2FlowResult> {
    if (this.authorizing) {
      return { success: false, error: 'Gmail authorization is already in progress' };
    }
    this.authorizing = true;
    try {
      return await this.runAuthorization();
    } finally {
      this.authorizing = false;
    }
  }

  private async runAuthorization(): Promise<OAuth2FlowResult> {
    try {
      if (!this.oauth2Client) {
        if (!this.initializeClient()) {
          return {
            success: false,
            error:
              'OAuth2 credentials not configured. Please set up your Google Cloud project first.',
          };
        }
      }

      if (!this.oauth2Client) {
        return {
          success: false,
          error: 'Failed to initialize OAuth2 client',
        };
      }

      // Check if we have valid tokens
      const existingTokens = this.getStoredTokens();
      if (existingTokens && this.isTokenValid(existingTokens)) {
        logger.info('Using existing valid tokens');
        return {
          success: true,
          tokens: existingTokens,
        };
      }

      logger.info('Starting OAuth2 flow...');

      // Loopback sign-in in the system browser (state + PKCE, 127.0.0.1 only)
      const newTokens = (await runLoopbackFlow({
        client: this.oauth2Client,
        scopes: SCOPES,
        openExternal: this.openExternal,
        timeoutMs: this.flowTimeoutMs,
      })) as OAuth2Tokens;

      // Store tokens
      this.storeTokens(newTokens);
      this.oauth2Client.setCredentials(newTokens);

      logger.info('OAuth2 authorization successful');

      return {
        success: true,
        tokens: newTokens,
      };
    } catch (error: any) {
      logger.error('OAuth2 authorization failed:', error);
      return {
        success: false,
        error: error.message || 'Authorization failed',
      };
    }
  }

  /**
   * Get authorized OAuth2 client
   */
  async getAuthorizedClient(): Promise<OAuth2Client | null> {
    if (!this.oauth2Client) {
      if (!this.initializeClient()) {
        return null;
      }
    }

    if (!this.oauth2Client) {
      return null;
    }

    const storedTokens = this.getStoredTokens();
    if (!storedTokens) {
      logger.warn('No stored tokens found');
      return null;
    }

    // Check if token is expired
    if (!this.isTokenValid(storedTokens)) {
      logger.info('Token expired, refreshing...');
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        logger.warn('Failed to refresh token');
        return null;
      }
    }

    return this.oauth2Client;
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<boolean> {
    try {
      if (!this.oauth2Client) {
        return false;
      }

      const tokens = this.getStoredTokens();
      if (!tokens || !tokens.refresh_token) {
        logger.warn('No refresh token available');
        return false;
      }

      this.oauth2Client.setCredentials(tokens);
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      // Store new tokens
      this.storeTokens(credentials as OAuth2Tokens);
      this.oauth2Client.setCredentials(credentials);

      logger.info('Access token refreshed successfully');
      return true;
    } catch (error: any) {
      logger.error('Failed to refresh access token:', error);
      return false;
    }
  }

  /**
   * Check if token is valid (not expired)
   */
  private isTokenValid(tokens: OAuth2Tokens): boolean {
    if (!tokens.expiry_date) {
      return false;
    }

    // Check if token expires in less than 5 minutes
    const expiryTime = tokens.expiry_date;
    const currentTime = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes

    return expiryTime > currentTime + bufferTime;
  }

  /**
   * Store tokens securely
   */
  private storeTokens(tokens: OAuth2Tokens): void {
    this.store.set(STORAGE_KEY, tokens);
    logger.info('OAuth2 tokens stored securely');
  }

  /**
   * Get stored tokens
   */
  private getStoredTokens(): OAuth2Tokens | null {
    return this.store.get(STORAGE_KEY) || null;
  }

  /**
   * Check if user is authorized
   */
  isAuthorized(): boolean {
    const tokens = this.getStoredTokens();
    return tokens !== null && this.isTokenValid(tokens);
  }

  /**
   * Get authorization status
   */
  getAuthStatus(): { isAuthorized: boolean; expiryDate?: number } {
    const tokens = this.getStoredTokens();
    if (!tokens) {
      return { isAuthorized: false };
    }

    return {
      isAuthorized: this.isTokenValid(tokens),
      expiryDate: tokens.expiry_date,
    };
  }

  /**
   * Revoke authorization and clear tokens
   */
  async revoke(): Promise<boolean> {
    try {
      if (this.oauth2Client) {
        const tokens = this.getStoredTokens();
        if (tokens?.access_token) {
          await this.oauth2Client.revokeToken(tokens.access_token);
        }
      }

      this.store.delete(STORAGE_KEY);
      this.oauth2Client = null;

      logger.info('OAuth2 authorization revoked');
      return true;
    } catch (error: any) {
      logger.error('Failed to revoke authorization:', error);
      return false;
    }
  }

  /**
   * Clear stored credentials and tokens
   */
  clearAll(): void {
    this.store.clear();
    this.oauth2Client = null;
    this.credentials = null;
    logger.info('All OAuth2 data cleared');
  }
}
