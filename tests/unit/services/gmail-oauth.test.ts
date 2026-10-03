/**
 * Gmail OAuth loopback sign-in, with a real loopback server, google-auth-library's real
 * `OAuth2Client` (only `getToken`, the network call, stubbed) and a captured
 * `openExternal`.
 */

import crypto from 'crypto';
import http from 'http';
import { OAuth2Client } from 'google-auth-library';
import { runLoopbackFlow } from '@main/services/gmail/loopback-flow';
import { OAuth2Handler } from '@main/services/gmail/oauth2-handler';
import { logger } from '@main/utils/logger';

const mockStore = new Map<string, unknown>();

jest.mock('electron', () => ({ shell: { openExternal: jest.fn() } }));
jest.mock('electron-store', () =>
  jest.fn().mockImplementation(() => ({
    get: (key: string) => mockStore.get(key),
    set: (key: string, value: unknown) => mockStore.set(key, value),
    delete: (key: string) => mockStore.delete(key),
    clear: () => mockStore.clear(),
  }))
);

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
const TOKENS = {
  access_token: 'access',
  refresh_token: 'refresh',
  scope: SCOPES[0],
  token_type: 'Bearer',
  expiry_date: Date.now() + 3_600_000,
};

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      })
      .on('error', reject);
  });
}

/** Resolves when the port refuses connections (the server is closed). */
function refused(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    http
      .get(`http://127.0.0.1:${port}/oauth2callback`, () => resolve(false))
      .on('error', (error: NodeJS.ErrnoException) => resolve(error.code === 'ECONNREFUSED'));
  });
}

/** Starts a flow and waits until the consent page would open in the browser. */
async function startFlow(timeoutMs = 10_000) {
  const client = new OAuth2Client('client-id.apps.googleusercontent.com', 'client-secret');
  const getToken = jest
    .spyOn(client, 'getToken')
    .mockImplementation(() => Promise.resolve({ tokens: TOKENS, res: null }) as never);
  const createServer = jest.spyOn(http, 'createServer');
  let opened: (url: string) => void = () => undefined;
  const authUrlOpened = new Promise<string>((resolve) => (opened = resolve));
  const openExternal = jest.fn(async (url: string) => opened(url));

  const flow = runLoopbackFlow({ client, scopes: SCOPES, openExternal, timeoutMs });
  flow.catch(() => undefined); // each test awaits it explicitly
  const authUrl = new URL(await authUrlOpened);
  const params = authUrl.searchParams;
  const redirectUri = params.get('redirect_uri') ?? '';
  const state = params.get('state') ?? '';
  const server = createServer.mock.results[0].value as http.Server;

  return {
    flow,
    authUrl,
    params,
    state,
    redirectUri,
    port: Number(new URL(redirectUri).port),
    server,
    getToken,
    openExternal,
    callback: (query: Record<string, string>) =>
      get(`${redirectUri}?${new URLSearchParams(query)}`),
  };
}

beforeEach(() => {
  jest.spyOn(logger, 'info').mockImplementation(() => logger);
  jest.spyOn(logger, 'warn').mockImplementation(() => logger);
  jest.spyOn(logger, 'error').mockImplementation(() => logger);
  mockStore.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('runLoopbackFlow', () => {
  it('listens on 127.0.0.1 only, on a port the OS picks', async () => {
    const f = await startFlow();

    expect(f.server.address()).toMatchObject({ address: '127.0.0.1', port: f.port });
    expect(f.port).toBeGreaterThan(0);

    await f.callback({ state: f.state, error: 'access_denied' });
    await expect(f.flow).rejects.toThrow();
  });

  it('opens an auth URL with state, an S256 code challenge and the 127.0.0.1 redirect URI', async () => {
    const f = await startFlow();

    expect(f.openExternal).toHaveBeenCalledTimes(1);
    expect(f.authUrl.origin).toBe('https://accounts.google.com');
    expect(f.redirectUri).toBe(`http://127.0.0.1:${f.port}/oauth2callback`);
    expect(f.state).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
    expect(f.params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(f.params.get('code_challenge_method')).toBe('S256');
    expect(f.params.get('access_type')).toBe('offline');
    expect(f.params.get('scope')).toBe(SCOPES[0]);

    await f.callback({ state: f.state, error: 'access_denied' });
    await expect(f.flow).rejects.toThrow();
  });

  it('a callback with a wrong or missing state gets 400 and the flow keeps waiting', async () => {
    const f = await startFlow();

    await expect(f.callback({ state: 'forged', code: 'stolen-code' })).resolves.toMatchObject({
      status: 400,
    });
    await expect(f.callback({ code: 'stolen-code' })).resolves.toMatchObject({ status: 400 });
    await expect(
      f.callback({
        state: `${f.state.slice(0, -1)}${f.state.endsWith('A') ? 'B' : 'A'}`,
        error: 'access_denied',
      })
    ).resolves.toMatchObject({ status: 400 });
    expect(f.getToken).not.toHaveBeenCalled();

    // Still listening: the real callback completes the flow
    await expect(f.callback({ state: f.state, code: 'real-code' })).resolves.toMatchObject({
      status: 200,
    });
    await expect(f.flow).resolves.toEqual(TOKENS);
  });

  it('a valid callback exchanges the code with the PKCE verifier and the same redirect URI', async () => {
    const f = await startFlow();

    const page = await f.callback({ state: f.state, code: 'auth-code', scope: SCOPES[0] });

    expect(page.status).toBe(200);
    expect(page.body).toContain('Authorization Successful');
    await expect(f.flow).resolves.toEqual(TOKENS);
    expect(f.getToken).toHaveBeenCalledTimes(1);
    const options = f.getToken.mock.calls[0][0] as unknown as Record<string, string>;
    expect(options).toEqual({
      code: 'auth-code',
      codeVerifier: expect.any(String),
      redirect_uri: f.redirectUri,
    });
    // The verifier is the one behind the challenge in the auth URL
    expect(crypto.createHash('sha256').update(options.codeVerifier).digest('base64url')).toBe(
      f.params.get('code_challenge')
    );
    await expect(refused(f.port)).resolves.toBe(true);
  });

  it('other paths such as /favicon.ico get 404 and do not end the flow', async () => {
    const f = await startFlow();

    await expect(get(`http://127.0.0.1:${f.port}/favicon.ico`)).resolves.toMatchObject({
      status: 404,
    });
    await expect(get(`http://127.0.0.1:${f.port}/`)).resolves.toMatchObject({ status: 404 });

    await f.callback({ state: f.state, code: 'auth-code' });
    await expect(f.flow).resolves.toEqual(TOKENS);
  });

  it('access_denied rejects with a clear message and closes the server', async () => {
    const f = await startFlow();

    const page = await f.callback({ state: f.state, error: 'access_denied' });

    expect(page.body).toContain('Authorization was not completed');
    await expect(f.flow).rejects.toThrow(
      'Gmail authorization was cancelled: access was not granted.'
    );
    expect(f.getToken).not.toHaveBeenCalled();
    await expect(refused(f.port)).resolves.toBe(true);
  });

  it('a timeout rejects and closes the server', async () => {
    const f = await startFlow(300);

    await expect(f.flow).rejects.toThrow('Gmail authorization timed out');
    expect(f.server.listening).toBe(false);
    await expect(refused(f.port)).resolves.toBe(true);
  });

  it('a failed token exchange rejects with its error and closes the server', async () => {
    const f = await startFlow();
    f.getToken.mockImplementation(() => Promise.reject(new Error('invalid_grant')) as never);

    await expect(f.callback({ state: f.state, code: 'auth-code' })).resolves.toMatchObject({
      status: 500,
    });
    await expect(f.flow).rejects.toThrow('invalid_grant');
    await expect(refused(f.port)).resolves.toBe(true);
  });
});

describe('OAuth2Handler', () => {
  /** A handler whose consent page "opens" by recording the URL. */
  function handler(flowTimeoutMs = 10_000) {
    const urls: string[] = [];
    let opened: () => void = () => undefined;
    const nextOpen = () => new Promise<void>((resolve) => (opened = resolve));
    let waiting = nextOpen();
    const createClient = jest.fn(
      ({ clientId, clientSecret }: { clientId: string; clientSecret: string }) => {
        const client = new OAuth2Client(clientId, clientSecret);
        jest
          .spyOn(client, 'getToken')
          .mockImplementation(() => Promise.resolve({ tokens: TOKENS, res: null }) as never);
        return client;
      }
    );
    const oauth = new OAuth2Handler({
      openExternal: async (url) => {
        urls.push(url);
        opened();
      },
      createClient,
      flowTimeoutMs,
    });
    return {
      oauth,
      urls,
      createClient,
      opened: async () => {
        await waiting;
        waiting = nextOpen();
        return new URL(urls[urls.length - 1]).searchParams;
      },
    };
  }

  it('rejects a second concurrent authorize() while the first waits for the browser', async () => {
    const h = handler();
    h.oauth.setCredentials({ clientId: 'id', clientSecret: 'secret' });

    const first = h.oauth.authorize();
    const params = await h.opened();
    await expect(h.oauth.authorize()).resolves.toEqual({
      success: false,
      error: 'Gmail authorization is already in progress',
    });
    expect(h.urls).toHaveLength(1);

    await get(`${params.get('redirect_uri')}?state=${params.get('state')}&code=c`);
    await expect(first).resolves.toMatchObject({ success: true, tokens: TOKENS });
  });

  it('ignores a stored legacy redirectUri and never returns the client secret', async () => {
    mockStore.set('gmail_credentials', {
      clientId: 'legacy-id',
      clientSecret: 'legacy-secret',
      redirectUri: 'http://localhost:3000/oauth2callback',
    });
    const h = handler(300);

    expect(h.oauth.getCredentials()).toEqual({
      clientId: 'legacy-id',
      clientSecret: 'legacy-secret',
    });
    expect(h.oauth.getCredentialStatus()).toEqual({
      clientId: 'legacy-id',
      hasClientSecret: true,
    });

    const result = h.oauth.authorize();
    const params = await h.opened();
    expect(h.createClient).toHaveBeenCalledWith({
      clientId: 'legacy-id',
      clientSecret: 'legacy-secret',
    });
    expect(params.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth2callback$/);
    await expect(result).resolves.toMatchObject({ success: false });

    // The flow ended (timeout), so a new sign-in may start
    const again = h.oauth.authorize();
    await h.opened();
    expect(h.urls).toHaveLength(2);
    await expect(again).resolves.toMatchObject({ success: false });
  });

  it('stores only the client ID and secret', () => {
    const h = handler();
    h.oauth.setCredentials({
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'http://localhost:3000/oauth2callback',
    } as never);

    expect(mockStore.get('gmail_credentials')).toEqual({ clientId: 'id', clientSecret: 'secret' });
    expect(h.oauth.getCredentialStatus()).toEqual({ clientId: 'id', hasClientSecret: true });
  });
});
