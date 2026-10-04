/**
 * `auth`: transitional ParkStay credential storage. V6 replaces it with per-provider
 * accounts. The password is write-only: `getCredentials` says only whether one is stored.
 */

import { z } from 'zod';
import type { UserInput } from '../types/common.types';
import type { SecretState } from '../types/secret.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

const C = CHANNELS.auth;

/**
 * What the renderer may know about the stored ParkStay credentials: never the password.
 * `hasPassword` is true only when the stored password can be read (`secretState: 'ok'`); an
 * `unreadable` one must be entered again.
 */
export interface CredentialStatus {
  email: string;
  hasPassword: boolean;
  secretState: SecretState;
}

export const credentialsInputSchema = z.object({
  email: z.string(),
  password: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().optional(),
});

export const auth = {
  storeCredentials: {
    channel: C.storeCredentials,
    request: credentialsInputSchema,
    args: {} as [credentials: UserInput],
    response: {} as boolean,
  },
  getCredentials: {
    channel: C.getCredentials,
    request: z.void(),
    args: {} as [],
    response: {} as CredentialStatus | null,
  },
  updateCredentials: {
    channel: C.updateCredentials,
    request: z.object({ email: z.string(), newPassword: z.string() }),
    args: {} as [email: string, newPassword: string],
    response: {} as boolean,
  },
  deleteCredentials: {
    channel: C.deleteCredentials,
    request: z.void(),
    args: {} as [],
    response: {} as boolean,
  },
  validateSession: {
    channel: C.validateSession,
    request: z.void(),
    args: {} as [],
    response: {} as boolean,
  },
} satisfies Namespace;
