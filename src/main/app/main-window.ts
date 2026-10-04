/**
 * The main window and the guards around it (architecture-notes §1, §7; ui-review item 10).
 *
 * - `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`.
 *   The preload is one bundled file (`scripts/build-preload.js`) that loads only `electron`.
 *   If it is missing (say `npm start` ran before the first preload build), the window shows
 *   an error page that says so instead of a blank app.
 * - The window's webContents is the trusted IPC sender and event target.
 * - New windows are always denied: http(s) and mailto links go to the system browser or mail
 *   app through `shell.openExternal`; anything else (`javascript:`, `file:`, …) is logged.
 * - Navigations and redirects off the app origin are cancelled. Hash-route changes are
 *   in-page navigations and never reach these guards.
 * - In development the CSP is sent as a response header from the Vite dev server. The
 *   production build carries it as a `<meta>` tag (`csp.ts`, `vite.config.ts`).
 * - A crashed renderer is reloaded once (`crash-policy.ts`).
 *
 * Provider sign-in and payment windows have their own policy (`provider-windows.ts`).
 */

import { App, BrowserWindow, Session, shell, WebContents } from 'electron';
import fs from 'fs';
import { APP_NAME } from '@shared/constants';
import type { TrustedWebContents } from '../ipc/trusted-web-contents';
import { describeUrl } from '../providers/sdk/url-patterns';
import { logger } from '../utils/logger';
import { reloadOnceOnRenderCrash } from './crash-policy';
import { buildCsp } from './csp';
import { createAppUrlMatcher, RendererEntry } from './renderer-entry';

const log = logger.child({ module: 'main-window' });

/** Protocols a link may hand to the operating system. */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export interface MainWindowOptions {
  entry: RendererEntry;
  preloadPath: string;
  trustedWebContents: TrustedWebContents;
  /** Launched at login with `--hidden`: the window is created but not shown. */
  startHidden: boolean;
  /** The window icon (`getBrandIconPath`). Omitted, the window uses the executable's icon. */
  icon?: string;
}

export function createMainWindow({
  entry,
  preloadPath,
  trustedWebContents,
  startHidden,
  icon,
}: MainWindowOptions): BrowserWindow {
  const hasPreload = fs.existsSync(preloadPath);
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      ...(hasPreload ? { preload: preloadPath } : {}),
    },
    title: APP_NAME,
    ...(icon ? { icon } : {}),
    show: false, // Don't show until ready
  });
  const contents = window.webContents;

  // Only this window's webContents may call IPC and receive events
  trustedWebContents.register(contents);
  guardNavigation(contents, {
    isAppUrl: createAppUrlMatcher(entry),
    openExternal: (url) => shell.openExternal(url),
  });
  reloadOnceOnRenderCrash(contents, log);

  if (!hasPreload) {
    log.error(`The preload script is missing: ${preloadPath}`);
    logLoadFailure(window.loadURL(preloadMissingPage(preloadPath)));
  } else if (entry.kind === 'dev-server') {
    installDevCsp(contents.session, entry.url);
    logLoadFailure(window.loadURL(entry.url));
    contents.openDevTools();
    log.info(`Loading from dev server: ${entry.url}`);
  } else {
    logLoadFailure(window.loadFile(entry.path));
    log.info(`Loading from file: ${entry.path}`);
  }

  window.once('ready-to-show', () => {
    if (startHidden) {
      log.info('App launched hidden at login — window will not be shown');
      return;
    }
    window.show();
  });

  return window;
}

/**
 * A self-contained error page (no scripts, nothing fetched) for a window whose preload
 * script is missing, as a `data:` URL.
 */
export function preloadMissingPage(preloadPath: string): string {
  const html = [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
    '<title>The app could not start</title>',
    '<style>body{font:15px/1.5 system-ui,sans-serif;margin:48px;max-width:640px}',
    'code{font-family:ui-monospace,monospace;word-break:break-all}</style></head><body>',
    '<h1>The app could not start</h1>',
    `<p>Its preload script is missing:</p><p><code>${escapeHtml(preloadPath)}</code></p>`,
    '<p>Running from source? Run <code>npm run build:preload</code> (or wait for',
    ' <code>npm run dev</code> to finish its first build), then restart the app.',
    ' Otherwise, reinstall the app.</p>',
    '</body></html>',
  ].join('');
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
  );
}

export interface NavigationGuardOptions {
  /** True for pages of the app itself (`createAppUrlMatcher`). */
  isAppUrl(url: string): boolean;
  openExternal(url: string): Promise<void>;
}

/** Denies every new window (sending http, https and mailto links out) and off-origin navigation. */
export function guardNavigation(
  contents: Pick<WebContents, 'setWindowOpenHandler' | 'on'>,
  { isAppUrl, openExternal }: NavigationGuardOptions
): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) {
      openExternal(url).catch((error: unknown) =>
        log.warn(`Could not open ${describeUrl(url)} externally: ${String(error)}`)
      );
    } else {
      log.warn(`Blocked a new window for ${describeUrl(url)}`);
    }
    return { action: 'deny' };
  });

  const blockForeign =
    (what: string) =>
    (event: { preventDefault(): void; url?: string }, legacyUrl?: string): void => {
      const url = event.url ?? legacyUrl ?? '';
      if (isAppUrl(url)) return;
      event.preventDefault();
      log.warn(`Blocked ${what} to ${describeUrl(url)}`);
    };
  contents.on('will-navigate', blockForeign('a navigation'));
  contents.on('will-redirect', blockForeign('a redirect'));
}

/** Every webContents the app creates refuses to attach a `<webview>`. */
export function denyWebviews(app: Pick<App, 'on'>): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
      event.preventDefault();
      log.warn('Blocked a <webview> attach');
    });
  });
}

/** Development only: sends the dev CSP as a header on every response from the dev server. */
export function installDevCsp(session: Pick<Session, 'webRequest'>, devServerUrl: string): void {
  const origin = new URL(devServerUrl).origin;
  const policy = buildCsp({ dev: true, devOrigin: origin });

  session.webRequest.onHeadersReceived((details, callback) => {
    if (originOf(details.url) !== origin) {
      callback({});
      return;
    }
    const responseHeaders: Record<string, string[] | string> = {};
    for (const [name, value] of Object.entries(details.responseHeaders ?? {})) {
      if (name.toLowerCase() !== 'content-security-policy') responseHeaders[name] = value;
    }
    responseHeaders['Content-Security-Policy'] = [policy];
    callback({ responseHeaders });
  });
}

function isExternalUrl(url: string): boolean {
  const protocol = protocolOf(url);
  return protocol !== null && EXTERNAL_PROTOCOLS.has(protocol);
}

function protocolOf(url: string): string | null {
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function logLoadFailure(load: Promise<void>): void {
  load.catch((error: unknown) => log.error(`The main window failed to load: ${String(error)}`));
}
