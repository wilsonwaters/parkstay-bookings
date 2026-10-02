/**
 * `queue`: transitional DBCA queue access, ported as it was. V3 replaces it with the
 * provider access gate; status changes arrive as `queue:status` events.
 */

import { z } from 'zod';
import type { QueueSession } from '../types/queue.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

export interface QueueStatusSnapshot {
  session: QueueSession | null;
  isActive: boolean;
  isExpired: boolean;
  isWaiting: boolean;
  estimatedWait: string;
  expiryRemaining: string;
}

const C = CHANNELS.queue;

export const queue = {
  check: { channel: C.check, request: z.void(), args: {} as [], response: {} as QueueSession },
  wait: { channel: C.wait, request: z.void(), args: {} as [], response: {} as QueueSession },
  getStatus: {
    channel: C.getStatus,
    request: z.void(),
    args: {} as [],
    response: {} as QueueStatusSnapshot,
  },
  clear: { channel: C.clear, request: z.void(), args: {} as [], response: undefined as void },
} satisfies Namespace;
