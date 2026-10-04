/**
 * `app` handlers: about info, the logs folder and launch at login.
 */

import { app, shell } from 'electron';
import fs from 'fs';
import os from 'os';
import { contract, SETTING_KEYS } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import { setLaunchAtLogin } from '../../app/login-item';
import { logger } from '../../utils/logger';
import type { Handle } from '../handle';

export function registerAppHandlers(handle: Handle, c: AppContainer): void {
  const api = contract.app;
  const settings = c.repositories.settings;

  handle(api.getInfo, () => ({
    name: app.getName(),
    version: app.getVersion(),
    electronVersion: process.versions.electron || '',
    chromeVersion: process.versions.chrome || '',
    nodeVersion: process.versions.node || '',
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    userDataPath: app.getPath('userData'),
    logsPath: c.logsDir,
    secretStorage: c.vault.status(),
  }));

  // The folder the log files are written to; created first, in case logging could not create it
  handle(api.openLogsFolder, async () => {
    fs.mkdirSync(c.logsDir, { recursive: true });
    const error = await shell.openPath(c.logsDir);
    if (error) throw new Error(`Could not open the logs folder: ${error}`);
    return true;
  });

  handle(api.setAutoLaunch, ({ enabled }) => {
    // In dev mode, process.execPath points to node_modules/electron/dist/electron.exe,
    // which when launched at login has no app context and shows Electron's generic
    // welcome window. Refuse to register — auto-launch only makes sense for packaged builds.
    if (enabled && !app.isPackaged) {
      logger.warn('Auto-launch refused: only available in packaged builds, not in dev mode');
      throw new Error(
        'Launch on startup is only available in the installed build, not when running from source.'
      );
    }

    setLaunchAtLogin(enabled);

    const { valueType, category } = SETTING_KEYS.launchOnStartup;
    settings.set('launchOnStartup', enabled, valueType, category);

    logger.info(`Auto-launch ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  });

  handle(api.getAutoLaunch, () => settings.getValue<boolean>('launchOnStartup') ?? false);
}
