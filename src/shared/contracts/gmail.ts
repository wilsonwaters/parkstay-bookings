/**
 * `gmail`: Gmail OAuth for OTP extraction. Connect, disconnect and status only: the inbox is
 * read by the main process alone (V6), never through IPC. The client secret is write-only:
 * `getCredentials` returns `{ clientId, hasClientSecret }`.
 */

import { z } from 'zod';
import type { GmailAuthStatus, OAuth2Credentials } from '../types/gmail.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

const C = CHANNELS.gmail;

/** What the renderer may know about the stored OAuth client: never the secret. */
export interface GmailCredentialStatus {
  clientId: string;
  hasClientSecret: boolean;
}

export const gmail = {
  setCredentials: {
    channel: C.setCredentials,
    request: z.object({ clientId: z.string(), clientSecret: z.string() }),
    args: {} as [credentials: OAuth2Credentials],
    response: {} as boolean,
  },
  getCredentials: {
    channel: C.getCredentials,
    request: z.void(),
    args: {} as [],
    response: {} as GmailCredentialStatus | null,
  },
  authorize: { channel: C.authorize, request: z.void(), args: {} as [], response: {} as boolean },
  checkAuthStatus: {
    channel: C.checkAuthStatus,
    request: z.void(),
    args: {} as [],
    response: {} as GmailAuthStatus,
  },
  revokeAuth: { channel: C.revokeAuth, request: z.void(), args: {} as [], response: {} as boolean },
} satisfies Namespace;
