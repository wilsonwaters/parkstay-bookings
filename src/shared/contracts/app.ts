/**
 * `app`: application info, the logs folder and launch at login.
 */

import { z } from 'zod';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

export interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  os: string;
  arch: string;
  userDataPath: string;
  logsPath: string;
}

const C = CHANNELS.app;

export const app = {
  getInfo: { channel: C.getInfo, request: z.void(), args: {} as [], response: {} as AppInfo },
  openLogsFolder: {
    channel: C.openLogsFolder,
    request: z.void(),
    args: {} as [],
    response: {} as boolean,
  },
  setAutoLaunch: {
    channel: C.setAutoLaunch,
    request: z.object({ enabled: z.boolean() }),
    args: {} as [enabled: boolean],
    response: {} as boolean,
  },
  getAutoLaunch: {
    channel: C.getAutoLaunch,
    request: z.void(),
    args: {} as [],
    response: {} as boolean,
  },
} satisfies Namespace;
