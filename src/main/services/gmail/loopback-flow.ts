/**
 * Gmail OAuth loopback sign-in (RFC 8252 "OAuth 2.0 for Native Apps"; tech-review #8).
 *
 * - A one-shot HTTP server listens on 127.0.0.1 only, on a port the OS picks.
 * - The redirect URI is `http://127.0.0.1:<port>/oauth2callback`, the same in the auth URL
 *   and in the token exchange.
 * - `state` is 32 random bytes (base64url), compared in constant time. A callback with a
 *   wrong or missing `state` gets 400 and the flow keeps waiting.
 * - PKCE with S256: the verifier never leaves the process until the token exchange.
 * - `error=` (e.g. the user pressed Cancel) ends the flow with a clear message. Any other
 *   path (`/favicon.ico`, …) gets 404 and the flow keeps waiting.
 * - On every way out (tokens, error, timeout, server failure) the timer is cleared and the
 *   server closed.
 */

import crypto from 'crypto';
import http from 'http';
import type { AddressInfo } from 'net';
import { CodeChallengeMethod } from 'google-auth-library';
import type { Credentials, GenerateAuthUrlOpts, GetTokenOptions } from 'google-auth-library';
import { logger } from '../../utils/logger';

const log = logger.child({ module: 'gmail-oauth' });

export const CALLBACK_PATH = '/oauth2callback';
export const DEFAULT_FLOW_TIMEOUT_MS = 5 * 60 * 1000;

/** The part of google-auth-library's `OAuth2Client` the flow uses. */
export interface LoopbackOAuthClient {
  generateCodeVerifierAsync(): Promise<{ codeVerifier: string; codeChallenge?: string }>;
  generateAuthUrl(options: GenerateAuthUrlOpts): string;
  getToken(options: GetTokenOptions): Promise<{ tokens: Credentials }>;
}

export interface LoopbackFlowOptions {
  client: LoopbackOAuthClient;
  scopes: string[];
  /** Opens the consent page in the system browser (`shell.openExternal`). */
  openExternal(url: string): Promise<void>;
  timeoutMs?: number;
}

/** Runs one sign-in: resolves with the tokens, or rejects (cancelled, timed out, failed). */
export async function runLoopbackFlow({
  client,
  scopes,
  openExternal,
  timeoutMs = DEFAULT_FLOW_TIMEOUT_MS,
}: LoopbackFlowOptions): Promise<Credentials> {
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  if (!codeChallenge) throw new Error('Could not create the PKCE code challenge');
  const state = crypto.randomBytes(32).toString('base64url');

  return new Promise<Credentials>((resolve, reject) => {
    let settled = false;
    let exchanging = false;
    let redirectUri = '';
    const server = http.createServer((req, res) => {
      void handleRequest(req, res);
    });

    const finish = (error: Error | null, tokens?: Credentials): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (error) reject(error);
      else resolve(tokens as Credentials);
    };

    const timer = setTimeout(
      () => finish(new Error('Gmail authorization timed out. Please try again.')),
      timeoutMs
    );

    const handleRequest = async (
      req: http.IncomingMessage,
      res: http.ServerResponse
    ): Promise<void> => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method !== 'GET' || url.pathname !== CALLBACK_PATH || settled) {
        respond(res, 404, 'Not found');
        return;
      }

      const params = url.searchParams;
      if (!stateMatches(params.get('state'), state)) {
        log.warn('Ignored an OAuth callback with a wrong or missing state');
        respond(res, 400, 'Invalid state');
        return;
      }

      const oauthError = params.get('error');
      if (oauthError) {
        respondHtml(res, 200, NOT_COMPLETED_PAGE);
        finish(new Error(describeOAuthError(oauthError)));
        return;
      }

      const code = params.get('code');
      if (!code) {
        respond(res, 400, 'Authorization code not found');
        return;
      }

      if (exchanging) {
        respond(res, 409, 'Authorization is already being completed');
        return;
      }
      exchanging = true;
      try {
        const { tokens } = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
        respondHtml(res, 200, SUCCESS_PAGE);
        finish(null, tokens);
      } catch (error) {
        respond(res, 500, 'Authorization failed');
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };

    server.on('error', (error) => finish(error));

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
      log.info(`OAuth2 callback server listening on 127.0.0.1:${port}`);

      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent',
        redirect_uri: redirectUri,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      });
      openExternal(authUrl).catch((error: unknown) =>
        finish(new Error(`Could not open the browser for Gmail sign-in: ${String(error)}`))
      );
    });
  });
}

function stateMatches(received: string | null, expected: string): boolean {
  if (received === null) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function describeOAuthError(code: string): string {
  if (code === 'access_denied') {
    return 'Gmail authorization was cancelled: access was not granted.';
  }
  return `Gmail authorization failed: ${code.replace(/[^\w.-]/g, '').slice(0, 64)}`;
}

function respond(res: http.ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' });
  res.end(text);
}

function respondHtml(res: http.ServerResponse, status: number, html: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' });
  res.end(html);
}

const NOT_COMPLETED_PAGE = `
<html>
  <head><title>Authorization Not Completed</title></head>
  <body style="font-family: Arial, sans-serif; text-align: center; padding: 40px;">
    <h1>Authorization was not completed</h1>
    <p>You can close this window and try again from the app.</p>
  </body>
</html>
`;

const SUCCESS_PAGE = `
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
`;
