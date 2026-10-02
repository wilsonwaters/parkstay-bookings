/**
 * `notifiers`: outbound notification channels (email SMTP). Ported as it was; P4 makes the
 * SMTP password write-only (`hasPassword`).
 */

import { z } from 'zod';
import { NotifierChannel } from '../types/notifier.types';
import type { Notifier, NotifierInput, TestConnectionResult } from '../types/notifier.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

const C = CHANNELS.notifiers;

const channelPayload = z.object({ channel: z.nativeEnum(NotifierChannel) });

/** A notifier's own settings object (for SMTP, an `SMTPConfig`). Stored encrypted, as sent. */
const notifierConfig = z.custom<NotifierInput['config']>(
  (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
  { message: 'Expected an object' }
);

export const notifierInputSchema = z.object({
  channel: z.nativeEnum(NotifierChannel),
  displayName: z.string(),
  enabled: z.boolean().optional(),
  config: notifierConfig,
});

export const notifiers = {
  list: { channel: C.list, request: z.void(), args: {} as [], response: {} as Notifier[] },
  get: {
    channel: C.get,
    request: channelPayload,
    args: {} as [channel: NotifierChannel],
    response: {} as Notifier | null,
  },
  configure: {
    channel: C.configure,
    request: notifierInputSchema,
    args: {} as [input: NotifierInput],
    response: {} as Notifier,
  },
  enable: {
    channel: C.enable,
    request: channelPayload,
    args: {} as [channel: NotifierChannel],
    response: {} as boolean,
  },
  disable: {
    channel: C.disable,
    request: channelPayload,
    args: {} as [channel: NotifierChannel],
    response: {} as boolean,
  },
  test: {
    channel: C.test,
    request: channelPayload,
    args: {} as [channel: NotifierChannel],
    response: {} as TestConnectionResult,
  },
} satisfies Namespace;
