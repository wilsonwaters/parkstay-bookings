/**
 * `gmail`: Gmail OAuth for OTP extraction. Ported as it was; P4 removes the inbox reads
 * (`waitForEmail`, `getRecentEmails`, `testSearch`) and stops returning the client secret.
 */

import { z } from 'zod';
import type {
  GmailAuthStatus,
  GmailMessage,
  OAuth2Credentials,
  OTPResult,
} from '../types/gmail.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

const C = CHANNELS.gmail;

export const gmail = {
  setCredentials: {
    channel: C.setCredentials,
    request: z.object({
      clientId: z.string(),
      clientSecret: z.string(),
      redirectUri: z.string().optional(),
    }),
    args: {} as [credentials: OAuth2Credentials],
    response: {} as boolean,
  },
  getCredentials: {
    channel: C.getCredentials,
    request: z.void(),
    args: {} as [],
    response: {} as OAuth2Credentials | null,
  },
  authorize: { channel: C.authorize, request: z.void(), args: {} as [], response: {} as boolean },
  checkAuthStatus: {
    channel: C.checkAuthStatus,
    request: z.void(),
    args: {} as [],
    response: {} as GmailAuthStatus,
  },
  revokeAuth: { channel: C.revokeAuth, request: z.void(), args: {} as [], response: {} as boolean },
  waitForEmail: {
    channel: C.waitForEmail,
    request: z.object({
      fromEmail: z.string().min(1),
      subject: z.string().min(1),
      timeout: z.number().int().positive().optional(),
    }),
    args: {} as [fromEmail: string, subject: string, timeout?: number],
    response: {} as OTPResult,
  },
  getRecentEmails: {
    channel: C.getRecentEmails,
    request: z.object({ maxResults: z.number().int().positive().optional() }),
    args: {} as [maxResults?: number],
    response: {} as GmailMessage[],
  },
  testSearch: {
    channel: C.testSearch,
    request: z.object({ fromEmail: z.string().min(1), subject: z.string().min(1) }),
    args: {} as [fromEmail: string, subject: string],
    response: {} as GmailMessage[],
  },
} satisfies Namespace;
