/**
 * `ElectronSessionHttpClient`: the production transport. Requests go through Chromium's
 * network stack on the provider's own session partition, `persist:provider-<id>`, with
 * `credentials: 'include'`, so the session's cookie store is used and updated. The
 * provider's sign-in and payment windows open on the same partition and share those
 * cookies (architecture-notes §3, brief D5).
 *
 * The partition's user agent is set once, to the desktop Chrome user agent, so API calls
 * and the windows present the same browser.
 *
 * This is the only file under `providers/` that imports `electron`. Build it after the app
 * is ready (`session.fromPartition` needs `ready`).
 */

import { session, type Cookie, type Session } from 'electron';
import type { ProviderId } from '@shared/types/provider.types';
import {
  BaseHttpClient,
  bufferedResponse,
  type CookieInit,
  type CookieStore,
  type HttpCookie,
  type HttpResponse,
  type TransportRequest,
} from './http';
import { CHROME_USER_AGENT } from './user-agent';

export function providerPartition(providerId: ProviderId): string {
  return `persist:provider-${providerId}`;
}

function toHttpCookie(cookie: Cookie): HttpCookie {
  return {
    name: cookie.name,
    value: cookie.value,
    domain: (cookie.domain ?? '').replace(/^\./, ''),
    path: cookie.path ?? '/',
    secure: cookie.secure ?? false,
    httpOnly: cookie.httpOnly ?? false,
    hostOnly: cookie.hostOnly ?? false,
    expires:
      cookie.session || cookie.expirationDate === undefined
        ? undefined
        : cookie.expirationDate * 1000,
    sameSite:
      cookie.sameSite === 'strict' || cookie.sameSite === 'lax'
        ? cookie.sameSite
        : cookie.sameSite === 'no_restriction'
          ? 'none'
          : undefined,
  };
}

/** The URL Electron needs to address a stored cookie when removing it. */
function cookieUrl(cookie: Cookie): string {
  const host = (cookie.domain ?? '').replace(/^\./, '');
  return `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path ?? '/'}`;
}

class ElectronCookieStore implements CookieStore {
  constructor(private readonly ses: Session) {}

  async get(url: string, name: string): Promise<HttpCookie | undefined> {
    const [cookie] = await this.ses.cookies.get({ url, name });
    return cookie ? toHttpCookie(cookie) : undefined;
  }

  async getAll(url: string): Promise<HttpCookie[]> {
    return (await this.ses.cookies.get({ url })).map(toHttpCookie);
  }

  async set(cookie: CookieInit): Promise<void> {
    await this.ses.cookies.set({
      url: cookie.url,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path ?? '/',
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      expirationDate: cookie.expires === undefined ? undefined : cookie.expires / 1000,
      sameSite:
        cookie.sameSite === undefined
          ? undefined
          : cookie.sameSite === 'none'
            ? 'no_restriction'
            : cookie.sameSite,
    });
  }

  async clear(): Promise<void> {
    const all = await this.ses.cookies.get({});
    await Promise.all(all.map((cookie) => this.ses.cookies.remove(cookieUrl(cookie), cookie.name)));
  }
}

export interface ElectronSessionHttpClientOptions {
  providerId: ProviderId;
  /** Defaults to the desktop Chrome user agent. Never a library default. */
  userAgent?: string;
}

export class ElectronSessionHttpClient extends BaseHttpClient {
  readonly providerId: ProviderId;
  readonly partition: string;
  readonly cookies: CookieStore;
  private readonly ses: Session;

  constructor({ providerId, userAgent = CHROME_USER_AGENT }: ElectronSessionHttpClientOptions) {
    super();
    this.providerId = providerId;
    this.partition = providerPartition(providerId);
    this.ses = session.fromPartition(this.partition);
    this.ses.setUserAgent(userAgent);
    this.cookies = new ElectronCookieStore(this.ses);
  }

  protected async transport(request: TransportRequest): Promise<HttpResponse> {
    const response = await this.ses.fetch(request.url, {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: request.body,
      signal: request.signal,
      redirect: request.redirect,
      credentials: 'include',
    });
    return bufferedResponse({
      providerId: this.providerId,
      status: response.status,
      // Electron's `Response.url` is not reliable (see `Session.fetch`); fall back to the request URL.
      url: response.url || request.url,
      headers: response.headers,
      body: await response.text(),
    });
  }
}
