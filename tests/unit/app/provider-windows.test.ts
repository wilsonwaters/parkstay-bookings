/**
 * Provider sign-in and payment windows against a mocked `electron` (`FakeBrowserWindow`):
 * the sandboxed window on the provider partition with no script of ours, the top-level
 * origin allow-list (navigations, main-frame redirects, new windows), refused permissions,
 * certificates, client certificates and HTTP credentials, the title, closing with the main
 * window, clearing and flushing the partition, and the shared partition and user agent.
 * `npm run test:electron` runs the real windows.
 */

import fs from 'fs';
import path from 'path';
import type { BrowserWindow } from 'electron';
import { isProviderWindow, ProviderWindows } from '@main/app/provider-windows';
import type { ProviderWindowRequest } from '@main/core/accounts/ports';
import { ElectronSessionHttpClient } from '@main/providers/sdk/http-electron';
import { CHROME_USER_AGENT, chromeUserAgent } from '@main/providers/sdk';
import { PARKSTAY_SIGN_IN_ORIGINS, PARKSTAY_SIGN_IN_URL } from '@main/providers/parkstay/auth';
import { logger } from '@main/utils/logger';
import type { FakeBrowserWindow } from '@tests/utils/electron-mocks';
import { stripComments } from '@tests/utils/strip-comments';

jest.mock('electron', () => jest.requireActual('@tests/utils/electron-mocks').electron());

const electron = jest.requireMock('electron') as {
  BrowserWindow: typeof FakeBrowserWindow;
  shell: { openExternal: jest.Mock };
  session: { fromPartition: jest.Mock };
};

type FakeSession = {
  setUserAgent: jest.Mock;
  setPermissionRequestHandler: jest.Mock;
  setPermissionCheckHandler: jest.Mock;
  setDevicePermissionHandler: jest.Mock;
  clearStorageData: jest.Mock;
  clearAuthCache: jest.Mock;
  cookies: { flushStore: jest.Mock };
  webRequest?: { onHeadersReceived: jest.Mock; onBeforeRequest: jest.Mock };
};

const partitionSession = (id = 'parkstay'): FakeSession =>
  electron.session.fromPartition(`persist:provider-${id}`) as FakeSession;

const SIGN_IN: ProviderWindowRequest = {
  providerId: 'parkstay',
  providerName: 'ParkStay WA',
  kind: 'sign-in',
  url: PARKSTAY_SIGN_IN_URL,
  allowedOrigins: PARKSTAY_SIGN_IN_ORIGINS,
  openBlockedExternally: true,
};

const PAYMENT: ProviderWindowRequest = {
  providerId: 'parkstay',
  providerName: 'ParkStay WA',
  kind: 'payment',
  url: 'https://parkstay.dbca.wa.gov.au/booking/',
  allowedOrigins: [...PARKSTAY_SIGN_IN_ORIGINS, 'https://*.dbca.wa.gov.au'],
  openBlockedExternally: false,
};

/** An Electron-style event whose `preventDefault` is recorded. */
function event(extra: Record<string, unknown> = {}) {
  return { ...extra, preventDefault: jest.fn() };
}

describe('ProviderWindows', () => {
  let windows: ProviderWindows;
  const lastWindow = (): FakeBrowserWindow =>
    electron.BrowserWindow.instances[electron.BrowserWindow.instances.length - 1];

  beforeEach(() => {
    electron.BrowserWindow.instances.length = 0;
    // The mocked partitions live for the whole file: forget their calls
    jest.clearAllMocks();
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    jest.spyOn(logger, 'info').mockImplementation(() => logger);
    jest.spyOn(logger, 'debug').mockImplementation(() => logger);
    windows = new ProviderWindows({ devTools: true });
  });

  afterEach(() => {
    windows.closeAll();
    jest.restoreAllMocks();
  });

  it('creates a sandboxed persist:provider-parkstay window with no preload', () => {
    const main = new electron.BrowserWindow({ title: 'WA Stay' });
    windows.attachMainWindow(main as unknown as BrowserWindow);
    windows.open(SIGN_IN);
    const window = lastWindow();
    const prefs = window.options.webPreferences;

    expect(prefs.partition).toBe('persist:provider-parkstay');
    expect(prefs.preload).toBeUndefined();
    expect(Object.keys(prefs)).not.toContain('preload');
    expect(prefs).toMatchObject({
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
      devTools: true,
    });
    expect(window.options).toMatchObject({
      parent: main,
      width: 520,
      height: 760,
      title: 'ParkStay WA — Sign in',
      show: false,
    });
    expect(window.setMenu).toHaveBeenCalledWith(null);
    expect(window.loadURL).toHaveBeenCalledWith(PARKSTAY_SIGN_IN_URL);
    expect(isProviderWindow(window.webContents)).toBe(true);
    expect(isProviderWindow(main.webContents)).toBe(false);
  });

  it('uses the partition the provider’s HTTP client uses, with the same user agent', () => {
    const client = new ElectronSessionHttpClient({ providerId: 'parkstay' });
    windows.open(SIGN_IN);

    expect(lastWindow().options.webPreferences.partition).toBe(client.partition);
    expect(partitionSession().setUserAgent).toHaveBeenLastCalledWith(client.userAgent);
    expect(client.userAgent).toBe(CHROME_USER_AGENT); // no process.versions.chrome in Jest

    const electron120 = new ProviderWindows({ devTools: false, chromeMajor: '120' });
    electron120.open({ ...SIGN_IN, providerId: 'other' });
    expect(partitionSession('other').setUserAgent).toHaveBeenCalledWith(chromeUserAgent('120'));
    expect(lastWindow().options.webPreferences.devTools).toBe(false);
    electron120.closeAll();
  });

  it('blocks will-navigate to https://evil.example/ and opens it in the system browser', () => {
    windows.open(SIGN_IN);
    const contents = lastWindow().webContents;

    expect(contents.willNavigate('https://evil.example/')).toBe(true);
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://evil.example/');
    expect(logger.warn).toHaveBeenCalledWith(
      'The parkstay sign-in window blocked a navigation to https://evil.example'
    );
  });

  it('allows will-navigate to dbcab2c.b2clogin.com and the other sign-in hosts', () => {
    windows.open(SIGN_IN);
    const contents = lastWindow().webContents;

    for (const url of [
      'https://dbcab2c.b2clogin.com/dbcab2c.onmicrosoft.com/b2c_1a_parkstay_prod/oauth2/v2.0/authorize?x=1',
      'https://auth2.dbca.wa.gov.au/sso/auth_local?next=/ssologin',
      'https://login.microsoftonline.com/common/x',
      'https://queue.dbca.wa.gov.au/site-queue/waiting-room/parkstayv2/',
      'https://parkstay.dbca.wa.gov.au/login-success/',
    ]) {
      expect([url, contents.willNavigate(url)]).toEqual([url, false]);
    }
    expect(electron.shell.openExternal).not.toHaveBeenCalled();
  });

  it('checks main-frame redirects, not sub-frame ones', () => {
    windows.open(SIGN_IN);
    const contents = lastWindow().webContents;

    expect(contents.willRedirect('https://accounts.google.com/o/oauth2/auth', true)).toBe(true);
    expect(contents.willRedirect('https://3ds.bank.example/challenge', false)).toBe(false);
    expect(contents.willRedirect('https://dbcab2c.b2clogin.com/x', true)).toBe(false);
  });

  it('logs only the origin of a blocked URL, never its path or query', () => {
    windows.open(SIGN_IN);
    lastWindow().webContents.willNavigate('https://evil.example/steal?token=SECRET-TOKEN');

    const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
    expect(logged).toContain('https://evil.example');
    expect(logged).not.toContain('SECRET-TOKEN');
    expect(logged).not.toContain('/steal');
  });

  it('new windows: an allowed URL loads in place, another web URL opens outside, others are denied', () => {
    windows.open(SIGN_IN);
    const window = lastWindow();
    const open = window.webContents.windowOpenHandler!;

    expect(open({ url: 'https://dbcab2c.b2clogin.com/help' })).toEqual({ action: 'deny' });
    expect(window.loadURL).toHaveBeenLastCalledWith('https://dbcab2c.b2clogin.com/help');
    expect(open({ url: 'https://www.dbca.wa.gov.au/privacy' })).toEqual({ action: 'deny' });
    expect(electron.shell.openExternal).toHaveBeenCalledWith('https://www.dbca.wa.gov.au/privacy');
    expect(open({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' });
    expect(electron.shell.openExternal).toHaveBeenCalledTimes(1);
  });

  it('denies every permission request', () => {
    windows.open(SIGN_IN);
    const ses = partitionSession();
    const [requestHandler] = ses.setPermissionRequestHandler.mock.calls[0];
    const [checkHandler] = ses.setPermissionCheckHandler.mock.calls[0];
    const [deviceHandler] = ses.setDevicePermissionHandler.mock.calls[0];

    for (const permission of ['geolocation', 'notifications', 'media', 'clipboard-read']) {
      const callback = jest.fn();
      requestHandler(lastWindow().webContents, permission, callback);
      expect(callback).toHaveBeenCalledWith(false);
      expect(checkHandler(lastWindow().webContents, permission)).toBe(false);
    }
    expect(deviceHandler({ deviceType: 'usb' })).toBe(false);

    // Once per partition: a second window does not register them again
    windows.closeAll();
    windows.open(SIGN_IN);
    expect(ses.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
  });

  it('rejects certificate errors and offers no client certificate or HTTP credentials', () => {
    windows.open(SIGN_IN);
    const contents = lastWindow().webContents;

    const cert = event();
    const certCallback = jest.fn();
    contents.emit(
      'certificate-error',
      cert,
      'https://parkstay.dbca.wa.gov.au/',
      'net::ERR_CERT_DATE_INVALID',
      {},
      certCallback
    );
    expect(cert.preventDefault).toHaveBeenCalled();
    expect(certCallback).toHaveBeenCalledWith(false);

    const client = event();
    const clientCallback = jest.fn();
    contents.emit('select-client-certificate', client, 'https://x.example/', [{}], clientCallback);
    expect(client.preventDefault).toHaveBeenCalled();
    expect(clientCallback).toHaveBeenCalledWith();

    const login = event();
    const loginCallback = jest.fn();
    contents.emit('login', login, {}, {}, loginCallback);
    expect(login.preventDefault).toHaveBeenCalled();
    expect(loginCallback).toHaveBeenCalledWith();

    const unload = event();
    contents.emit('will-prevent-unload', unload);
    expect(unload.preventDefault).toHaveBeenCalled();
  });

  it('never touches the partition’s response headers (the pages keep their own CSP)', () => {
    const ses = partitionSession();
    ses.webRequest = { onHeadersReceived: jest.fn(), onBeforeRequest: jest.fn() };
    windows.open(SIGN_IN);

    expect(ses.webRequest.onHeadersReceived).not.toHaveBeenCalled();
    expect(ses.webRequest.onBeforeRequest).not.toHaveBeenCalled();
  });

  it('keeps its title against the page, showing the host it is on', () => {
    const handle = windows.open(SIGN_IN);
    const window = lastWindow();
    const seen = jest.fn();
    handle.onNavigate(seen);

    const titleChange = event();
    window.emit('page-title-updated', titleChange, 'Sign in to Microsoft');
    expect(titleChange.preventDefault).toHaveBeenCalled();

    window.webContents.navigate('https://dbcab2c.b2clogin.com/x?y=1');
    expect(window.title).toBe('ParkStay WA — Sign in · dbcab2c.b2clogin.com');
    expect(seen).toHaveBeenCalledWith({
      url: 'https://dbcab2c.b2clogin.com/x?y=1',
      httpStatus: 200,
    });
    expect(handle.currentUrl()).toBe('https://dbcab2c.b2clogin.com/x?y=1');
  });

  it('the payment window allows *.dbca.wa.gov.au, and only logs a blocked host', () => {
    windows.open(PAYMENT);
    const window = lastWindow();
    expect(window.options.title).toBe('ParkStay WA — Payment');

    expect(window.webContents.willNavigate('https://ledger.dbca.wa.gov.au/pay')).toBe(false);
    expect(window.webContents.willNavigate('https://payments.bank.example/3ds')).toBe(true);
    expect(electron.shell.openExternal).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'The parkstay payment window blocked a navigation to https://payments.bank.example'
    );
  });

  it('refuses to open or load a URL off the allow-list, and a second window of a kind', () => {
    expect(() => windows.open({ ...SIGN_IN, url: 'https://evil.example/' })).toThrow(
      'not an allowed origin'
    );
    expect(electron.BrowserWindow.instances).toHaveLength(0);

    const handle = windows.open(SIGN_IN);
    expect(() => handle.load('https://evil.example/x')).toThrow('not an allowed origin');
    expect(() => windows.open(SIGN_IN)).toThrow('already open');
  });

  it('closing: the handle hears it, find forgets it; the main window closing closes them all', () => {
    const main = new electron.BrowserWindow({ title: 'WA Stay' });
    windows.attachMainWindow(main as unknown as BrowserWindow);
    const signIn = windows.open(SIGN_IN);
    const payment = windows.open(PAYMENT);
    const closed = jest.fn();
    signIn.onClosed(closed);
    expect(windows.find('parkstay', 'sign-in')).toBe(signIn);

    main.close();

    expect(closed).toHaveBeenCalledTimes(1);
    expect(signIn.isClosed()).toBe(true);
    expect(payment.isClosed()).toBe(true);
    expect(windows.find('parkstay', 'sign-in')).toBeUndefined();
  });

  it('clears and flushes the provider partition', async () => {
    await windows.clear('parkstay');
    await windows.flush('parkstay');
    const ses = partitionSession();

    expect(ses.clearStorageData).toHaveBeenCalledTimes(1);
    expect(ses.clearAuthCache).toHaveBeenCalledTimes(1);
    expect(ses.cookies.flushStore).toHaveBeenCalledTimes(1);
  });

  it('provider-windows.ts never mentions preload outside comments', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../../src/main/app/provider-windows.ts'),
      'utf8'
    );
    expect(stripComments(source)).not.toMatch(/preload/i);
  });
});
