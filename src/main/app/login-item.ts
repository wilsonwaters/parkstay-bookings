/**
 * Launch at login.
 *
 * - Windows: a `HKCU\...\CurrentVersion\Run` value named after the AppUserModelId
 *   (`com.parkstay.bookings` when packaged, `bootstrap.ts`), running the executable with
 *   `--hidden`. The portable build runs from a temp folder, so the entry points at the
 *   portable exe itself (`PORTABLE_EXECUTABLE_FILE`). The path is quoted: Electron writes
 *   it as given, and "WA Stay" has a space.
 * - macOS: a login item opened hidden.
 *
 * v1.x never set an AppUserModelId, so its Run value is named with Electron's default,
 * `electron.app.<productName>` (`LEGACY_LOGIN_ITEM_NAMES`), and runs the v1.x executable
 * (`LEGACY_EXE_NAME`) from its install folder with `--hidden`, unquoted (BQ4). After the first-run
 * migration, `replaceLegacyLoginItems` removes it and, when the user had launch at login
 * on, registers the new entry.
 */

import { app as electronApp } from 'electron';
import path from 'path';
import { HIDDEN_ARG } from './single-instance';

/** The v1.x executable name (`productName` + `.exe`). */
export const LEGACY_EXE_NAME = 'WA ParkStay Bookings.exe'; // legacy-name-ok

/** Run value names v1.x may have used: Electron's default AppUserModelId for its name. */
export const LEGACY_LOGIN_ITEM_NAMES = [
  'electron.app.WA ParkStay Bookings', // legacy-name-ok (v1.x productName)
  'electron.app.parkstay-bookings', // legacy-name-ok (v1.x package name)
] as const;

interface LaunchItem {
  name: string;
  path: string;
  args: string[];
  scope?: string;
}

/** The part of Electron's `app` this module uses. */
export interface LoginItemApp {
  readonly isPackaged: boolean;
  getLoginItemSettings(options?: { path?: string; args?: string[] }): {
    launchItems?: LaunchItem[];
  };
  setLoginItemSettings(settings: {
    openAtLogin: boolean;
    openAsHidden?: boolean;
    path?: string;
    args?: string[];
    name?: string;
  }): void;
}

/** Where a login launch starts this app. */
export interface LaunchTarget {
  app: LoginItemApp;
  /** `process.platform`. */
  platform: NodeJS.Platform;
  /** `process.execPath`. */
  execPath: string;
  /** `process.env`: `PORTABLE_EXECUTABLE_FILE` is set by the portable build's launcher. */
  env: Readonly<Record<string, string | undefined>>;
}

export interface LoginItemHost extends LaunchTarget {
  log: { info(message: string): unknown };
}

/** The running app as a launch target. */
export function currentLaunchTarget(): LaunchTarget {
  return {
    app: electronApp,
    platform: process.platform,
    execPath: process.execPath,
    env: process.env,
  };
}

/** The executable a Windows login launch starts: the portable exe, or this one. */
export function launchExecutable(host: Pick<LaunchTarget, 'env' | 'execPath'>): string {
  return host.env.PORTABLE_EXECUTABLE_FILE || host.execPath;
}

/**
 * Turns launch at login on or off. On Windows the Run value takes the default name (the
 * AppUserModelId). The caller refuses `true` when running from source.
 */
export function setLaunchAtLogin(
  enabled: boolean,
  host: LaunchTarget = currentLaunchTarget()
): void {
  if (host.platform === 'darwin') {
    host.app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: enabled });
    return;
  }
  host.app.setLoginItemSettings({
    openAtLogin: enabled,
    path: `"${launchExecutable(host)}"`,
    args: enabled ? [HIDDEN_ARG] : [],
  });
}

/** Lower case, quotes removed, `/` as `\`: how Windows compares these paths. */
function normalise(value: string): string {
  return value.replace(/"/g, '').replace(/\//g, '\\').toLowerCase();
}

/**
 * The names of the Run values that start the v1.x executable. Electron matches
 * `launchItems` by the first space-separated token of an unquoted command line, so the
 * lookup also returns unrelated values that share that prefix; only a value whose whole
 * command line starts with the legacy executable's path is kept. The legacy exe sat in the
 * install folder, which an interactive upgrade nests WA Stay in (BQ7), so the folder above
 * is checked too.
 */
function legacyLaunchItemNames(host: LoginItemHost): string[] {
  const exeDir = path.win32.dirname(launchExecutable(host));
  const legacyExes = [exeDir, path.win32.dirname(exeDir)].map((dir) =>
    path.win32.join(dir, LEGACY_EXE_NAME)
  );
  const names = new Set<string>();
  for (const legacyExe of legacyExes) {
    const items = host.app.getLoginItemSettings({ path: legacyExe }).launchItems ?? [];
    for (const item of items) {
      if (item.scope !== undefined && item.scope !== 'user') continue;
      const commandLine = normalise([item.path, ...item.args].join(' '));
      if (commandLine.startsWith(normalise(legacyExe))) names.add(item.name);
    }
  }
  return [...names];
}

export interface ReplaceLegacyLoginItemsResult {
  /** The Run values removed (names; each was deleted if it existed). */
  removed: string[];
  /** Whether the new entry was registered. */
  registered: boolean;
}

/**
 * After the first-run migration (Windows, packaged only): removes the v1.x Run values, then
 * registers the WA Stay entry if the migrated setting `launchOnStartup` is on. Elsewhere it
 * does nothing: v1.x shipped only for Windows, and a dev build never registers.
 */
export function replaceLegacyLoginItems(
  launchOnStartup: boolean,
  host: LoginItemHost
): ReplaceLegacyLoginItemsResult {
  if (host.platform !== 'win32' || !host.app.isPackaged) return { removed: [], registered: false };

  const removed = [...new Set([...legacyLaunchItemNames(host), ...LEGACY_LOGIN_ITEM_NAMES])];
  for (const name of removed) {
    host.app.setLoginItemSettings({ openAtLogin: false, name, path: host.execPath });
  }
  host.log.info(
    `legacy-install: cleared the legacy launch-at-login entries: ${removed.join(', ')}`
  );

  if (launchOnStartup) {
    setLaunchAtLogin(true, host);
    host.log.info('legacy-install: launch at login registered for WA Stay');
  }
  return { removed, registered: launchOnStartup };
}
