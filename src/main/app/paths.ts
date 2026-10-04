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
  return location.isPackaged
    ? path.join(location.resourcesPath, 'icons', 'icon.png')
    : path.join(location.appPath, 'resources', 'icons', 'icon.png');
}

function currentLocation(): AppLocation {
  return {
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
  };
}
