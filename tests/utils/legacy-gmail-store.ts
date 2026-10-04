/**
 * Writes a v1.x `gmail-oauth.json` the way the released app did: electron-store 8.2.0 is a
 * thin wrapper over the installed conf@10.2.0, given `name: 'gmail-oauth'`, `cwd: userData`
 * and the hard-coded legacy `encryptionKey`. Each call encrypts with a fresh random IV.
 */

import Conf from 'conf';

/** The v1.x hard-coded electron-store key (`oauth2-handler.ts` in v1.x). */
export const LEGACY_GMAIL_ENCRYPTION_KEY = 'parkstay-gmail-oauth-encryption-key';

export const LEGACY_GMAIL_CREDENTIALS = {
  clientId: 'legacy-client-id.apps.googleusercontent.com',
  clientSecret: 'GOCSPX-legacy-client-secret-4f1e',
  redirectUri: 'http://localhost:3000/oauth2callback',
};

export const LEGACY_GMAIL_TOKENS = {
  access_token: 'ya29.legacy-access-token-91c2',
  refresh_token: '1//legacy-refresh-token-7d3a',
  scope: 'https://www.googleapis.com/auth/gmail.readonly',
  token_type: 'Bearer',
  expiry_date: 4102444800000, // 2100-01-01
};

/** Writes `<userDataDir>/gmail-oauth.json` with conf and returns its path. */
export function writeLegacyGmailStore(
  userDataDir: string,
  data: Record<string, unknown> = {
    gmail_credentials: LEGACY_GMAIL_CREDENTIALS,
    gmail_oauth_tokens: LEGACY_GMAIL_TOKENS,
  },
  encryptionKey: string = LEGACY_GMAIL_ENCRYPTION_KEY
): string {
  const store = new Conf<Record<string, unknown>>({
    cwd: userDataDir,
    configName: 'gmail-oauth',
    encryptionKey,
    projectVersion: '1.2.0',
  });
  for (const [key, value] of Object.entries(data)) store.set(key, value);
  return store.path;
}
