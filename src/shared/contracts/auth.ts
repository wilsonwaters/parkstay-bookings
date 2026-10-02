/**
 * `auth`: transitional ParkStay credential storage, ported as it was. V6 replaces it with
 * per-provider accounts; P4 stops `getCredentials` returning the password.
 */

import { z } from 'zod';
import type { UserCredentials, UserInput } from '../types/common.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

const C = CHANNELS.auth;

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
    response: {} as UserCredentials | null,
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
