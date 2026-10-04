/**
 * OAuth2 Handler
 * Manages OAuth2 authentication flow for Gmail API.
 *
 * The client credentials and tokens are stored in `<userData>/gmail-oauth.json` (format 2),
 * each as a SecretVault envelope (`security/gmail-secret-file.ts`). Nothing is read at
 * construction. Something stored that cannot be decrypted reads as `secretState:
 * 'unreadable'` and is kept until the user saves new credentials or signs in again; a file
 * that cannot be read at all is then moved aside to `gmail-oauth.json.corrupt-<timestamp>`.
 */

import path from 'path';
import fs from 'fs';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { shell } from 'electron';
import {
  GmailAuthStatus,
  OAuth2Credentials,
  OAuth2Tokens,
  OAuth2FlowResult,
} from '@shared/types/gmail.types';
import type { SecretState } from '@shared/types/secret.types';
import type { GmailCredentialStatus } from '@shared/contracts/gmail';
import {
  preserveCorruptGmailSecretFile,
  readGmailSecretFile,
  writeGmailSecretFile,
  type GmailSecretFileV2,
} from '../../security/gmail-secret-file';
import type { SecretVault } from '../../security/secret-vault';
import { logger } from '../../utils/logger';
import { DEFAULT_FLOW_TIMEOUT_MS, runLoopbackFlow } from './loopback-flow';

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

type StoredItem = 'credentials' | 'tokens';

/** A stored item: its value when it reads. */
type ItemRead<T> = { state: 'ok'; value: T } | { state: Exclude<SecretState, 'ok'> };

export interface OAuth2HandlerOptions {
  /** Encrypts and decrypts what is stored. */
  vault: SecretVault;
  /** `<userData>/gmail-oauth.json`. */
  filePath: string;
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
  private readonly vault: SecretVault;
  private readonly filePath: string;
  private oauth2Client: OAuth2Client | null = null;
  private credentials: OAuth2Credentials | null = null;
  private readonly openExternal: (url: string) => Promise<void>;
  private readonly createClient: (credentials: OAuth2Credentials) => OAuth2Client;
  private readonly flowTimeoutMs: number;
  private authorizing = false;

  constructor(options: OAuth2HandlerOptions) {
    this.vault = options.vault;
    this.filePath = options.filePath;
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
    this.writeItem('credentials', this.credentials);

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

    const stored = this.readItem<OAuth2Credentials>('credentials');
    if (stored.state === 'ok') {
      this.credentials = clientCredentials(stored.value);
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
    this.writeItem('tokens', tokens);
    logger.info('OAuth2 tokens stored securely');
  }

  /**
   * Get stored tokens
   */
  private getStoredTokens(): OAuth2Tokens | null {
    const tokens = this.readItem<OAuth2Tokens>('tokens');
    return tokens.state === 'ok' ? tokens.value : null;
  }

  /**
   * Reads and decrypts one stored item. A `local` envelope is re-encrypted to `os` when that
   * is available.
   */
  private readItem<T>(item: StoredItem): ItemRead<T> {
    const stored = readGmailSecretFile(this.filePath);
    if (stored.kind === 'missing') return { state: 'missing' };
    if (stored.kind === 'other') return { state: 'unreadable' };

    const envelope = stored.file[item];
    const secret = this.vault.read(envelope, (resealed) =>
      this.updateFile((file) => {
        if (file[item] === envelope) file[item] = resealed;
      })
    );
    if (secret.state !== 'ok') return { state: secret.state };
    try {
      return { state: 'ok', value: JSON.parse(secret.value) as T };
    } catch {
      return { state: 'unreadable' };
    }
  }

  /** Encrypts and stores one item (`undefined` removes it). The user saved it: this may replace an unreadable one. */
  private writeItem(item: StoredItem, value: unknown): void {
    const envelope = value === undefined ? undefined : this.vault.encrypt(JSON.stringify(value));
    this.updateFile((file) => {
      if (envelope === undefined) delete file[item];
      else file[item] = envelope;
    });
  }

  /** Read, change, write back atomically. A file that cannot be read is moved aside first. */
  private updateFile(change: (file: GmailSecretFileV2) => void): void {
    const stored = readGmailSecretFile(this.filePath);
    let file: GmailSecretFileV2 = { format: 2 };
    if (stored.kind === 'v2') file = stored.file;
    if (stored.kind === 'other') this.preserveUnreadableFile();
    change(file);
    writeGmailSecretFile(this.filePath, file);
  }

  private preserveUnreadableFile(): void {
    const kept = preserveCorruptGmailSecretFile(this.filePath);
    logger.warn(
      `Unreadable Gmail OAuth file replaced; the old one is kept as ${path.basename(kept)}`
    );
  }

  /**
   * Check if user is authorized
   */
  isAuthorized(): boolean {
    const tokens = this.getStoredTokens();
    return tokens !== null && this.isTokenValid(tokens);
  }

  /**
   * Get authorization status. `secretState` is `unreadable` when the stored credentials or
   * tokens cannot be decrypted (then never authorized), otherwise that of the tokens.
   */
  getAuthStatus(): GmailAuthStatus {
    const tokens = this.readItem<OAuth2Tokens>('tokens');
    const credentials = this.readItem<OAuth2Credentials>('credentials');
    if (tokens.state === 'unreadable' || credentials.state === 'unreadable') {
      return { isAuthorized: false, secretState: 'unreadable' };
    }
    if (tokens.state !== 'ok') {
      return { isAuthorized: false, secretState: tokens.state };
    }

    return {
      isAuthorized: this.isTokenValid(tokens.value),
      expiryDate: tokens.value.expiry_date,
      secretState: 'ok',
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

      this.writeItem('tokens', undefined);
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
    if (readGmailSecretFile(this.filePath).kind === 'other') this.preserveUnreadableFile();
    else fs.rmSync(this.filePath, { force: true });
    this.oauth2Client = null;
    this.credentials = null;
    logger.info('All OAuth2 data cleared');
  }
}
