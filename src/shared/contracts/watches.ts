/**
 * `watches`: availability watches of the local profile.
 */

import { z } from 'zod';
import type { Watch, WatchExecutionResult, WatchInput } from '../types/watch.types';
import { CHANNELS } from './channels';
import { id, idPayload, Namespace } from './define';

const C = CHANNELS.watches;

/**
 * A watch as the renderer sends it. Field types only, so it can be `.partial()`'d for
 * updates; the cross-field rules (dates in order and in the future) stay in `WatchService`.
 */
export const watchInputSchema = z.object({
  name: z.string().min(1),
  parkId: z.string(),
  parkName: z.string(),
  campgroundId: z.string().min(1),
  campgroundName: z.string(),
  arrivalDate: z.date(),
  departureDate: z.date(),
  numGuests: z.number().int().positive(),
  preferredSites: z.array(z.string()).optional(),
  siteType: z.string().optional(),
  checkIntervalMinutes: z.number().int().positive().optional(),
  autoBook: z.boolean().optional(),
  notifyOnly: z.boolean().optional(),
  allowPartialMatch: z.boolean().optional(),
  maxPrice: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const watches = {
  list: { channel: C.list, request: z.void(), args: {} as [], response: {} as Watch[] },
  get: {
    channel: C.get,
    request: idPayload,
    args: {} as [id: number],
    response: {} as Watch | null,
  },
  create: {
    channel: C.create,
    request: watchInputSchema,
    args: {} as [input: WatchInput],
    response: {} as Watch,
  },
  update: {
    channel: C.update,
    request: z.object({ id, updates: watchInputSchema.partial() }),
    args: {} as [id: number, updates: Partial<WatchInput>],
    response: {} as Watch,
  },
  delete: {
    channel: C.delete,
    request: idPayload,
    args: {} as [id: number],
    response: {} as boolean,
  },
  activate: {
    channel: C.activate,
    request: idPayload,
    args: {} as [id: number],
    response: undefined as void,
  },
  deactivate: {
    channel: C.deactivate,
    request: idPayload,
    args: {} as [id: number],
    response: undefined as void,
  },
  runNow: {
    channel: C.runNow,
    request: idPayload,
    args: {} as [id: number],
    response: {} as WatchExecutionResult,
  },
} satisfies Namespace;
