/**
 * Where the app's files are on disk.
 *
 * B3 adds the user-data paths (the WA Stay data folder and the legacy one) here.
 */

import { app } from 'electron';
import path from 'path';

export interface AppLocation {
  /** `app.isPackaged`. */
  isPackaged: boolean;
  /** `app.getAppPath()`: the project root when running from source. */
  appPath: string;
  /** `process.resourcesPath`: the packaged app's `resources` folder. */
  resourcesPath: string;
}

/**
 * The WA Stay icon as a PNG, for the window (Linux and development) and OS notifications.
 *
 * - Packaged: `<resources>/icons/icon.png`, copied there by `extraResources` in
 *   `electron-builder.json`. A path under `app.getAppPath()` would point inside `app.asar`,
 *   which Electron cannot load an icon from.
 * - From source: `<project>/resources/icons/icon.png`.
 */
export function getBrandIconPath(location: AppLocation = currentLocation()): string {
  return iconPath('icon.png', location);
}

/**
 * The small (80 px) WA Stay icon the SMTP emails show inline at 40 px, from the same place as
 * `getBrandIconPath` (`extraResources` ships it too). The 1024 px icon would add about 50 KB to
 * every email.
 */
export function getEmailLogoPath(location: AppLocation = currentLocation()): string {
  return iconPath('email-logo.png', location);
}

function iconPath(file: string, location: AppLocation): string {
  return location.isPackaged
    ? path.join(location.resourcesPath, 'icons', file)
    : path.join(location.appPath, 'resources', 'icons', file);
}

function currentLocation(): AppLocation {
  return {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  };
}
