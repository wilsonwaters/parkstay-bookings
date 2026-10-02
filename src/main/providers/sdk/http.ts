/**
 * `HttpClient`: how provider code talks to the network (architecture-notes §3).
 *
 * Two implementations share `BaseHttpClient`:
 * - `ElectronSessionHttpClient` (`http-electron.ts`, production): Chromium's network stack on
 *   the provider's session partition `persist:provider-<id>`, so cookies are shared with the
 *   provider's sign-in and payment windows.
 * - `NodeHttpClient` (`http-node.ts`, tests): Node's `fetch` with an in-memory cookie jar.
 *
 * Provider code never imports `electron` or an HTTP library; it only sees this interface.
 *
 * Every request has a timeout (default 30 s) and honours the caller's `AbortSignal`;
 * whichever fires first wins, and the timer is always cleared. A timeout rejects with
 * `ProviderTimeoutError`, a caller abort with an `AbortError`, and a failure to get any
 * response with `ProviderHttpError` (status 0). The response body is read before the
 * request settles, so the timeout covers it too.
 */

import type { ProviderId } from '@shared/types/provider.types';
import {
  createAbortError,
  ProviderError,
  ProviderHttpError,
  ProviderParseError,
  ProviderTimeoutError,
} from './errors';

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | null | undefined;

export interface HttpRequestOptions {
  /** Appended to the URL's search params; `null`/`undefined` values are skipped. */
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  /** Default 30 000. */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Default `follow`. `manual` returns a 3xx response as is. */
  redirect?: 'follow' | 'manual' | 'error';
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  /** The final URL after redirects (the request URL when the transport cannot tell). */
  url: string;
  headers: Headers;
  text(): Promise<string>;
  /** Parses the body; a body that is not JSON rejects with `ProviderParseError`. */
  json<T = unknown>(): Promise<T>;
}

export type FormFields = Record<string, QueryValue> | URLSearchParams;

export interface HttpCookie {
  name: string;
  value: string;
  /** Without a leading dot. */
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  /** True when the cookie is sent to `domain` only, not its subdomains. */
  hostOnly: boolean;
  /** Epoch milliseconds; undefined for a session cookie. */
  expires?: number;
  sameSite?: 'strict' | 'lax' | 'none';
}

export interface CookieInit {
  /** The URL the cookie belongs to. Without `domain`, the cookie is host-only for its host. */
  url: string;
  name: string;
  value: string;
  /** Makes it a domain cookie, also sent to subdomains (`dbca.wa.gov.au`). */
  domain?: string;
  /** Default `/`. */
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  /** Epoch milliseconds; omit for a session cookie. */
  expires?: number;
  sameSite?: 'strict' | 'lax' | 'none';
}

export interface CookieStore {
  get(url: string, name: string): Promise<HttpCookie | undefined>;
  /** The cookies a request to `url` would send. */
  getAll(url: string): Promise<HttpCookie[]>;
  set(cookie: CookieInit): Promise<void>;
  /** Removes every cookie in the store. */
  clear(): Promise<void>;
}

export interface HttpClient {
  readonly providerId: ProviderId;
  readonly cookies: CookieStore;
  request(method: HttpMethod, url: string, options?: HttpRequestOptions): Promise<HttpResponse>;
  /** GET, expecting 2xx JSON: `ProviderHttpError` otherwise, `ProviderParseError` for a non-JSON body. */
  getJson<T = unknown>(url: string, options?: Omit<HttpRequestOptions, 'body'>): Promise<T>;
  /** POST `application/x-www-form-urlencoded`, expecting 2xx JSON, with the same errors as `getJson`. */
  postForm<T = unknown>(
    url: string,
    form: FormFields,
    options?: Omit<HttpRequestOptions, 'body'>
  ): Promise<T>;
  /** A client on the same transport and cookies that adds `headers` to every request. */
  withDefaults(defaults: { headers?: Record<string, string> }): HttpClient;
}

export const DEFAULT_TIMEOUT_MS = 30_000;

/** What a transport receives: absolute URL with the query applied, merged headers, a live signal. */
export interface TransportRequest {
  method: HttpMethod;
  url: string;
  headers: Headers;
  body?: string;
  signal: AbortSignal;
  redirect: 'follow' | 'manual' | 'error';
}

/** Header names are case-insensitive; later sources win. */
export function mergeHeaders(...sources: Array<Record<string, string> | undefined>): Headers {
  const headers = new Headers();
  for (const source of sources) {
    if (!source) continue;
    for (const [name, value] of Object.entries(source)) headers.set(name, value);
  }
  return headers;
}

export function buildUrl(url: string, query?: Record<string, QueryValue>): string {
  if (!query) return url;
  const target = new URL(url);
  for (const [name, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    target.searchParams.append(name, String(value));
  }
  return target.href;
}

function formBody(form: FormFields): string {
  if (form instanceof URLSearchParams) return form.toString();
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(form)) {
    if (value === null || value === undefined) continue;
    params.append(name, String(value));
  }
  return params.toString();
}

/** A response whose body has already been read. */
export function bufferedResponse(init: {
  providerId: ProviderId;
  status: number;
  url: string;
  headers: Headers;
  body: string;
}): HttpResponse {
  const { providerId, status, url, headers, body } = init;
  return {
    status,
    ok: status >= 200 && status < 300,
    url,
    headers,
    text: () => Promise.resolve(body),
    json: <T>() => {
      try {
        return Promise.resolve(JSON.parse(body) as T);
      } catch (error) {
        const type = headers.get('content-type') ?? 'no content type';
        return Promise.reject(
          new ProviderParseError({
            providerId,
            url,
            message: `${providerId}: expected JSON but got ${type}`,
            cause: error,
          })
        );
      }
    },
  };
}

export abstract class BaseHttpClient implements HttpClient {
  abstract readonly providerId: ProviderId;
  abstract readonly cookies: CookieStore;

  /**
   * Sends one request and reads its body. Called with a signal that fires on the caller's
   * abort or the timeout; the base class turns the resulting rejection into the right error.
   */
  protected abstract transport(request: TransportRequest): Promise<HttpResponse>;

  /** Headers every request from this client carries (see `withDefaults`). */
  protected defaultHeaders: Record<string, string> = {};

  async request(
    method: HttpMethod,
    url: string,
    options: HttpRequestOptions = {}
  ): Promise<HttpResponse> {
    const { signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
    const target = buildUrl(url, options.query);
    if (signal?.aborted) throw createAbortError(signal);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      return await this.transport({
        method,
        url: target,
        headers: mergeHeaders(this.defaultHeaders, options.headers),
        body: options.body === undefined ? undefined : String(options.body),
        signal: controller.signal,
        redirect: options.redirect ?? 'follow',
      });
    } catch (error) {
      if (signal?.aborted) throw createAbortError(signal);
      if (timedOut) {
        throw new ProviderTimeoutError({
          providerId: this.providerId,
          url: target,
          timeoutMs,
          cause: error,
        });
      }
      if (error instanceof ProviderError) throw error;
      throw new ProviderHttpError({
        providerId: this.providerId,
        status: 0,
        url: target,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  getJson<T = unknown>(url: string, options: Omit<HttpRequestOptions, 'body'> = {}): Promise<T> {
    return this.expectJson<T>(
      this.request('GET', url, {
        ...options,
        headers: { Accept: 'application/json, text/plain, */*', ...options.headers },
      })
    );
  }

  postForm<T = unknown>(
    url: string,
    form: FormFields,
    options: Omit<HttpRequestOptions, 'body'> = {}
  ): Promise<T> {
    return this.expectJson<T>(
      this.request('POST', url, {
        ...options,
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          ...options.headers,
        },
        body: formBody(form),
      })
    );
  }

  withDefaults(defaults: { headers?: Record<string, string> }): HttpClient {
    const headers = Object.fromEntries(
      mergeHeaders(this.defaultHeaders, defaults.headers).entries()
    );
    return new DefaultsHttpClient(this.providerId, this.cookies, headers, (request) =>
      this.transport(request)
    );
  }

  private async expectJson<T>(pending: Promise<HttpResponse>): Promise<T> {
    const response = await pending;
    if (!response.ok) {
      throw new ProviderHttpError({
        providerId: this.providerId,
        status: response.status,
        url: response.url,
      });
    }
    if (response.status === 204) return undefined as T;
    return response.json<T>();
  }
}

/** `withDefaults`: the parent's transport and cookies, plus extra default headers. */
class DefaultsHttpClient extends BaseHttpClient {
  constructor(
    readonly providerId: ProviderId,
    readonly cookies: CookieStore,
    headers: Record<string, string>,
    private readonly send: (request: TransportRequest) => Promise<HttpResponse>
  ) {
    super();
    this.defaultHeaders = headers;
  }

  protected transport(request: TransportRequest): Promise<HttpResponse> {
    return this.send(request);
  }
}
