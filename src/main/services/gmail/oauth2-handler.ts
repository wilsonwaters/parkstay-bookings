/**
 * OAuth2 Handler
 * Manages OAuth2 authentication flow for Gmail API
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import Store from 'electron-store';
import { shell } from 'electron';
import { OAuth2Credentials, OAuth2Tokens, OAuth2FlowResult } from '@shared/types/gmail.types';
import { logger } from '../../utils/logger';
import http from 'http';
import { AddressInfo } from 'net';
import url from 'url';

const STORAGE_KEY = 'gmail_oauth_tokens';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

interface StoreSchema {
  gmail_oauth_tokens?: OAuth2Tokens;
  gmail_credentials?: OAuth2Credentials;
}

export class OAuth2Handler {
  private store: Store<StoreSchema>;
  private oauth2Client: OAuth2Client | null = null;
  private credentials: OAuth2Credentials | null = null;

  constructor() {
    this.store = new Store<StoreSchema>({
      name: 'gmail-oauth',
      encryptionKey: 'parkstay-gmail-oauth-encryption-key',
    });
  }

  /**
   * Set OAuth2 credentials (Client ID and Secret from Google Cloud Console)
   */
  setCredentials(credentials: OAuth2Credentials): void {
    this.credentials = credentials;
    this.store.set('gmail_credentials', credentials);

    this.oauth2Client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      credentials.redirectUri
    );

    // Load existing tokens if available
    const tokens = this.getStoredTokens();
    if (tokens) {
      this.oauth2Client.setCredentials(tokens);
    }

    logger.info('OAuth2 credentials set successfully');
  }

  /**
   * Get stored credentials
   */
  getCredentials(): OAuth2Credentials | null {
    if (this.credentials) {
      return this.credentials;
    }

    const stored = this.store.get('gmail_credentials');
    if (stored) {
      this.credentials = stored;
      return stored;
    }

    return null;
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

    this.oauth2Client = new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      credentials.redirectUri
    );

    const tokens = this.getStoredTokens();
    if (tokens) {
      this.oauth2Client.setCredentials(tokens);
    }

    return true;
  }

  /**
   * Start OAuth2 authorization flow
   */
  async authorize(): Promise<OAuth2FlowResult> {
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

      // Start callback server first to get assigned port, then generate auth URL
      const newTokens = await this.startCallbackServer();

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
   * Start local HTTP server to receive OAuth2 callback.
   * Uses port 0 to let the OS assign an available port, avoiding conflicts.
   */
  private startCallbackServer(): Promise<OAuth2Tokens> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          if (!req.url) {
            return;
          }

          const queryObject = url.parse(req.url, true).query;
          const code = queryObject.code as string;

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head>
                  <title>Authorization Successful</title>
                  <style>
                    body {
                      font-family: Arial, sans-serif;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      height: 100vh;
                      margin: 0;
                      background-color: #f0f0f0;
                    }
                    .container {
                      background: white;
                      padding: 40px;
                      border-radius: 8px;
                      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                      text-align: center;
                    }
                    h1 { color: #4CAF50; }
                    p { color: #666; }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <h1>Authorization Successful!</h1>
                    <p>You can close this window and return to ParkStay Bookings.</p>
                  </div>
                </body>
              </html>
            `);

            server.close();

            // Exchange code for tokens
            if (!this.oauth2Client) {
              reject(new Error('OAuth2 client not initialized'));
              return;
            }

            const { tokens } = await this.oauth2Client.getToken(code);
            resolve(tokens as OAuth2Tokens);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Authorization code not found');
            server.close();
            reject(new Error('Authorization code not found'));
          }
        } catch (error) {
          logger.error('Error in callback server:', error);
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal server error');
          server.close();
          reject(error);
        }
      });

      // Use port 0 to let the OS assign an available port
      server.listen(0, async () => {
        const port = (server.address() as AddressInfo).port;
        logger.info(`OAuth2 callback server listening on port ${port}`);

        // Generate auth URL with the dynamic port redirect URI
        const redirectUri = `http://localhost:${port}`;
        if (this.oauth2Client) {
          const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            prompt: 'consent',
            redirect_uri: redirectUri,
          });
          await shell.openExternal(authUrl);
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('Authorization timeout'));
      }, 300000);
    });
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
