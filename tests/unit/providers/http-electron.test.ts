/**
 * ElectronSessionHttpClient against a mocked `electron`: the provider partition, the user
 * agent, `credentials: 'include'`, headers, and the cookie store mapping onto `ses.cookies`.
 */

import { ElectronSessionHttpClient, providerPartition } from '@main/providers/sdk/http-electron';
import { CHROME_USER_AGENT, isAbortError, ProviderTimeoutError } from '@main/providers/sdk';

jest.mock('electron', () => {
  const ses = {
    setUserAgent: jest.fn(),
    fetch: jest.fn(),
    cookies: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
  };
  return { session: { fromPartition: jest.fn(() => ses) }, __ses: ses };
});

const electron = jest.requireMock('electron') as {
  session: { fromPartition: jest.Mock };
  __ses: {
    setUserAgent: jest.Mock;
    fetch: jest.Mock;
    cookies: { get: jest.Mock; set: jest.Mock; remove: jest.Mock };
  };
};
const ses = electron.__ses;

const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('ElectronSessionHttpClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ses.fetch.mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    ses.cookies.get.mockResolvedValue([]);
    ses.cookies.set.mockResolvedValue(undefined);
    ses.cookies.remove.mockResolvedValue(undefined);
  });

  it("uses the provider's persistent partition, persist:provider-<id>", () => {
    const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });

    expect(electron.session.fromPartition).toHaveBeenCalledWith('persist:provider-parkstay');
    expect(client.partition).toBe('persist:provider-parkstay');
    expect(providerPartition('rac')).toBe('persist:provider-rac');
  });

  it('sets the Chrome user agent on the partition exactly once', async () => {
    const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });
    await client.getJson('https://parkstay.dbca.wa.gov.au/api/a');
    await client
      .withDefaults({ headers: { Referer: 'https://x.example/' } })
      .getJson('https://parkstay.dbca.wa.gov.au/api/b');

    expect(ses.setUserAgent).toHaveBeenCalledTimes(1);
    expect(ses.setUserAgent).toHaveBeenCalledWith(CHROME_USER_AGENT);
    expect(CHROME_USER_AGENT).toMatch(/Chrome\/\d+/);
    expect(CHROME_USER_AGENT).not.toMatch(/axios|python|curl|java|httpclient|electron/i);
  });

  it("calls ses.fetch with credentials: 'include' and the Referer header passed in", async () => {
    const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });

    const data = await client.getJson('https://parkstay.dbca.wa.gov.au/api/campground_map/', {
      query: { format: 'json' },
      headers: { Referer: 'https://parkstay.dbca.wa.gov.au/' },
    });

    expect(data).toEqual({ ok: true });
    expect(ses.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = ses.fetch.mock.calls[0];
    expect(url).toBe('https://parkstay.dbca.wa.gov.au/api/campground_map/?format=json');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', redirect: 'follow' });
    expect(init.headers).toMatchObject({ referer: 'https://parkstay.dbca.wa.gov.au/' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('posts a form body', async () => {
    const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });
    await client.postForm('https://parkstay.dbca.wa.gov.au/api/create_booking', { campsite: 3 });

    const [, init] = ses.fetch.mock.calls[0];
    expect(init).toMatchObject({ method: 'POST', body: 'campsite=3' });
    expect(init.headers['content-type']).toContain('application/x-www-form-urlencoded');
  });

  it('falls back to the request URL when the response has none', async () => {
    ses.fetch.mockResolvedValue(new Response('{}', { status: 503 }));
    const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });

    const response = await client.request('GET', 'https://parkstay.dbca.wa.gov.au/api/x');
    expect(response).toMatchObject({
      status: 503,
      ok: false,
      url: 'https://parkstay.dbca.wa.gov.au/api/x',
    });
  });

  it('times out with ProviderTimeoutError and aborts ses.fetch', async () => {
    let seen: AbortSignal | undefined;
    ses.fetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          seen = init.signal ?? undefined;
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError'))
          );
        })
    );
    const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });

    const error = await client
      .request('GET', 'https://parkstay.dbca.wa.gov.au/api/x', { timeoutMs: 20 })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ProviderTimeoutError);
    expect(isAbortError(error)).toBe(false);
    expect(seen?.aborted).toBe(true);
  });

  describe('cookies', () => {
    it('get maps to ses.cookies.get({ url, name })', async () => {
      ses.cookies.get.mockResolvedValue([
        {
          name: 'sitequeuesession',
          value: 'AB=C==',
          domain: '.dbca.wa.gov.au',
          hostOnly: false,
          path: '/',
          secure: true,
          httpOnly: false,
          session: true,
          sameSite: 'no_restriction',
        },
      ]);
      const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });

      const cookie = await client.cookies.get('https://queue.dbca.wa.gov.au/', 'sitequeuesession');

      expect(ses.cookies.get).toHaveBeenCalledWith({
        url: 'https://queue.dbca.wa.gov.au/',
        name: 'sitequeuesession',
      });
      expect(cookie).toEqual({
        name: 'sitequeuesession',
        value: 'AB=C==',
        domain: 'dbca.wa.gov.au',
        hostOnly: false,
        path: '/',
        secure: true,
        httpOnly: false,
        expires: undefined,
        sameSite: 'none',
      });
    });

    it('getAll maps to ses.cookies.get({ url }), with expiry in milliseconds', async () => {
      ses.cookies.get.mockResolvedValue([
        {
          name: 'a',
          value: '1',
          domain: 'parkstay.dbca.wa.gov.au',
          hostOnly: true,
          path: '/',
          expirationDate: 1_800_000_000,
        },
      ]);
      const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });

      const cookies = await client.cookies.getAll('https://parkstay.dbca.wa.gov.au/');

      expect(ses.cookies.get).toHaveBeenCalledWith({ url: 'https://parkstay.dbca.wa.gov.au/' });
      expect(cookies).toEqual([
        expect.objectContaining({ name: 'a', hostOnly: true, expires: 1_800_000_000_000 }),
      ]);
    });

    it('set maps to ses.cookies.set, with a domain and expiry in seconds', async () => {
      const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });

      await client.cookies.set({
        url: 'https://queue.dbca.wa.gov.au/',
        name: 'sitequeuesession',
        value: 'KEY',
        domain: 'dbca.wa.gov.au',
        expires: 1_800_000_000_000,
        sameSite: 'none',
      });

      expect(ses.cookies.set).toHaveBeenCalledWith({
        url: 'https://queue.dbca.wa.gov.au/',
        name: 'sitequeuesession',
        value: 'KEY',
        domain: 'dbca.wa.gov.au',
        path: '/',
        secure: undefined,
        httpOnly: undefined,
        expirationDate: 1_800_000_000,
        sameSite: 'no_restriction',
      });
    });

    it('clear removes every cookie in the partition through ses.cookies.remove', async () => {
      ses.cookies.get.mockResolvedValue([
        {
          name: 'sitequeuesession',
          value: 'x',
          domain: '.dbca.wa.gov.au',
          path: '/',
          secure: true,
        },
        {
          name: 'csrftoken',
          value: 'y',
          domain: 'parkstay.dbca.wa.gov.au',
          path: '/api',
          secure: false,
        },
      ]);
      const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });

      await client.cookies.clear();

      expect(ses.cookies.get).toHaveBeenCalledWith({});
      expect(ses.cookies.remove.mock.calls).toEqual([
        ['https://dbca.wa.gov.au/', 'sitequeuesession'],
        ['http://parkstay.dbca.wa.gov.au/api', 'csrftoken'],
      ]);
    });
  });
});
