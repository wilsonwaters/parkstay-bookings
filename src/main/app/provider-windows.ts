/**
 * Provider sign-in and payment windows (brief D5; architecture-notes §7, §12.32).
 *
 * A provider window shows the provider's own pages, on the provider's session partition
 * (`persist:provider-<id>`), the one its `ElectronSessionHttpClient` uses. Cookies the person
 * gets by signing in are therefore the ones API calls and holds send, and a hold placed
 * through the client is in the basket the payment window shows.
 *
 * The pages are not ours, so the window gets nothing of the app:
 * - `sandbox`, `contextIsolation`, no Node integration (frames and workers included), web
 *   security on, no `<webview>`, no drag-and-drop navigation, no spellchecker downloads, safe
 *   dialogs, DevTools only when not packaged, and no script of ours injected into the page;
 * - it is never a trusted IPC sender (`isProviderWindow` keeps the sender guard honest);
 * - top-level navigations and redirects (`will-navigate`, main-frame `will-redirect`) are
 *   allowed only to the window's origin allow-list (`url-patterns.ts`). Anything else is
 *   cancelled and logged by origin only, never with its path or query (a sign-in link carries
 *   a token, a payment page a booking hash). A sign-in window sends a blocked http(s) page to
 *   the system browser; a payment window only logs it, so the host can be added (PQ5).
 *   Sub-frames are not restricted: payment providers use them (BPOINT, 3-D Secure);
 * - a new window for an allowed URL loads in the same window; any other http(s) URL opens in
 *   the system browser;
 * - every permission request and check, and every device request, is refused; certificate
 *   errors are rejected; no client certificate or HTTP credentials are offered; a page cannot
 *   stop the window closing (`will-prevent-unload`);
 * - the page keeps its own Content-Security-Policy: nothing here touches response headers.
 *
 * The window has no address bar, so its title names the provider, the purpose and the host
 * it shows (`ParkStay WA — Sign in · dbcab2c.b2clogin.com`); a page cannot change it.
 */

import { BrowserWindow, session as electronSession, shell } from 'electron';
import type { Session, WebContents } from 'electron';
import type { ProviderId } from '@shared/types/provider.types';
import type {
  ProviderSessionStore,
  ProviderWindowHandle,
  ProviderWindowKind,
  ProviderWindowNavigation,
  ProviderWindowOpener,
  ProviderWindowRequest,
} from '../core/accounts/ports';
import { providerPartition } from '../providers/sdk/http-electron';
import { describeUrl, matchesOrigin } from '../providers/sdk/url-patterns';
import { chromeUserAgent, runtimeChromeMajor } from '../providers/sdk/user-agent';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'provider-windows' });

const WIDTH = 520;
const HEIGHT = 760;

/** Every provider window's webContents. */
const providerContents = new WeakSet<object>();

/** True for the webContents of a provider sign-in or payment window. */
export function isProviderWindow(contents: unknown): boolean {
  return typeof contents === 'object' && contents !== null && providerContents.has(contents);
}

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export interface ProviderWindowsOptions {
  /** DevTools in provider windows: never in a packaged build. */
  devTools: boolean;
  /** The Chrome major version the partition presents. Defaults to the one Electron runs. */
  chromeMajor?: string;
}

export class ProviderWindows implements ProviderWindowOpener, ProviderSessionStore {
  private readonly windows = new Map<
    string,
    { handle: ProviderWindowHandle; window: BrowserWindow }
  >();
  private readonly hardened = new WeakSet<Session>();
  private readonly userAgent: string;
  private parent: BrowserWindow | null = null;

  constructor(private readonly options: ProviderWindowsOptions) {
    this.userAgent = chromeUserAgent(options.chromeMajor ?? runtimeChromeMajor());
  }

  /** Provider windows sit above the main window, and close with it. */
  attachMainWindow(window: BrowserWindow): void {
    this.parent = window;
    window.once('closed', () => {
      if (this.parent === window) this.parent = null;
      this.closeAll();
    });
  }

  open(request: ProviderWindowRequest): ProviderWindowHandle {
    const { providerId, kind } = request;
    if (!matchesOrigin(request.url, request.allowedOrigins)) {
      throw new Error(
        `A ${kind} window for ${providerId} cannot open ${describeUrl(request.url)}: it is not an allowed origin`
      );
    }
    const key = `${providerId}:${kind}`;
    if (this.windows.has(key)) {
      throw new Error(`A ${kind} window for ${providerId} is already open`);
    }

    const partition = providerPartition(providerId);
    this.harden(electronSession.fromPartition(partition));
    const baseTitle = `${request.providerName} — ${kind === 'sign-in' ? 'Sign in' : 'Payment'}`;
    const parent = this.parent && !this.parent.isDestroyed() ? this.parent : undefined;
    const window = new BrowserWindow({
      ...(parent ? { parent } : {}),
      width: WIDTH,
      height: HEIGHT,
      title: baseTitle,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        navigateOnDragDrop: false,
        spellcheck: false,
        safeDialogs: true,
        devTools: this.options.devTools,
      },
    });
    window.setMenu(null);
    const contents = window.webContents;
    providerContents.add(contents);

    const what = `${providerId} ${kind} window`;
    const allowed = (url: string): boolean => matchesOrigin(url, request.allowedOrigins);
    const openOutside = (url: string): void => {
      shell
        .openExternal(url)
        .catch((error: unknown) =>
          log.warn(`Could not open ${describeUrl(url)} externally: ${String(error)}`)
        );
    };
    const blocked = (url: string, action: string): void => {
      log.warn(`The ${what} blocked ${action} to ${describeUrl(url)}`);
      if (request.openBlockedExternally && isWebUrl(url)) openOutside(url);
    };
    const load = (url: string): void => {
      window
        .loadURL(url)
        .catch((error: unknown) =>
          log.debug(`The ${what} did not finish loading ${describeUrl(url)}: ${String(error)}`)
        );
    };

    let closed = false;
    const navigationListeners = new Set<(navigation: ProviderWindowNavigation) => void>();
    const closedListeners: Array<() => void> = [];

    this.guard(contents, { allowed, blocked, load, openOutside, what });
    window.on('page-title-updated', (event) => event.preventDefault());
    window.once('ready-to-show', () => {
      window.show();
      window.focus();
    });
    contents.on('did-navigate', (_event, url, httpResponseCode) => {
      const host = hostOf(url);
      if (!window.isDestroyed()) window.setTitle(host ? `${baseTitle} · ${host}` : baseTitle);
      for (const listener of [...navigationListeners]) {
        listener({ url, httpStatus: typeof httpResponseCode === 'number' ? httpResponseCode : 0 });
      }
    });
    window.once('closed', () => {
      closed = true;
      if (this.windows.get(key)?.handle === handle) this.windows.delete(key);
      for (const listener of closedListeners.splice(0)) listener();
    });

    const handle: ProviderWindowHandle = {
      providerId,
      kind,
      focus: () => {
        if (closed) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
      },
      close: () => {
        if (!closed) window.close();
      },
      load: (url) => {
        if (!allowed(url)) {
          throw new Error(
            `The ${what} cannot load ${describeUrl(url)}: it is not an allowed origin`
          );
        }
        if (!closed) load(url);
      },
      currentUrl: () => (closed ? '' : contents.getURL()),
      onNavigate: (listener) => {
        navigationListeners.add(listener);
        return () => navigationListeners.delete(listener);
      },
      onClosed: (listener) => {
        if (closed) listener();
        else closedListeners.push(listener);
      },
      isClosed: () => closed,
    };
    this.windows.set(key, { handle, window });

    log.info(`Opened the ${what} on ${describeUrl(request.url)}`);
    load(request.url);
    return handle;
  }

  find(providerId: ProviderId, kind: ProviderWindowKind): ProviderWindowHandle | undefined {
    return this.windows.get(`${providerId}:${kind}`)?.handle;
  }

  /** Closes every provider window at once (`destroy`: no page can hold it open). */
  closeAll(): void {
    for (const { window } of [...this.windows.values()]) {
      if (!window.isDestroyed()) window.destroy();
    }
  }

  async clear(providerId: ProviderId): Promise<void> {
    const ses = electronSession.fromPartition(providerPartition(providerId));
    await ses.clearStorageData();
    await ses.clearAuthCache();
  }

  async flush(providerId: ProviderId): Promise<void> {
    await electronSession.fromPartition(providerPartition(providerId)).cookies.flushStore();
  }

  /** Permission, device and identity settings for a provider partition, once per session. */
  private harden(ses: Session): void {
    if (this.hardened.has(ses)) return;
    this.hardened.add(ses);
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.setDevicePermissionHandler(() => false);
    ses.setUserAgent(this.userAgent);
  }

  private guard(
    contents: WebContents,
    handlers: {
      allowed(url: string): boolean;
      blocked(url: string, action: string): void;
      load(url: string): void;
      openOutside(url: string): void;
      what: string;
    }
  ): void {
    const { allowed, blocked, load, openOutside, what } = handlers;

    contents.on('will-navigate', (event, legacyUrl) => {
      const url = (event as { url?: string }).url ?? legacyUrl;
      if (allowed(url)) return;
      event.preventDefault();
      blocked(url, 'a navigation');
    });
    contents.on('will-redirect', (event, legacyUrl, _isInPlace, legacyIsMainFrame) => {
      const details = event as { url?: string; isMainFrame?: boolean };
      if (!(details.isMainFrame ?? legacyIsMainFrame)) return;
      const url = details.url ?? legacyUrl;
      if (allowed(url)) return;
      event.preventDefault();
      blocked(url, 'a redirect');
    });
    contents.setWindowOpenHandler(({ url }) => {
      if (allowed(url)) load(url);
      else if (isWebUrl(url)) openOutside(url);
      else log.warn(`The ${what} blocked a new window for ${describeUrl(url)}`);
      return { action: 'deny' };
    });
    contents.on('certificate-error', (event, url, error, _certificate, callback) => {
      event.preventDefault();
      callback(false);
      log.warn(`The ${what} rejected a certificate for ${describeUrl(url)} (${error})`);
    });
    contents.on('select-client-certificate', (event, _url, _list, callback) => {
      // As for `app`'s event: no certificate is offered (the default would send the first).
      event.preventDefault();
      (callback as (certificate?: unknown) => void)();
    });
    contents.on('login', (event, _details, _authInfo, callback) => {
      event.preventDefault();
      callback();
    });
    contents.on('will-prevent-unload', (event) => event.preventDefault());
    contents.on('render-process-gone', (_event, details) =>
      log.warn(`The ${what} page stopped (${details.reason})`)
    );
  }
}
