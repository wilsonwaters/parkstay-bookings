/**
 * `watches`: availability watches of the local profile.
 */

import { z } from 'zod';
import { ProviderIdSchema, StayParamsSchema } from '../types/provider.types';
import { LocationRefSchema, StayInputSchema } from '../types/stay.types';
import type { Watch, WatchExecutionResult, WatchInput, WatchUpdate } from '../types/watch.types';
import { assertTypeEquals } from '../utils/type-equality';
import { CHANNELS } from './channels';
import { id, idPayload, Namespace } from './define';

const C = CHANNELS.watches;

/**
 * A watch as the renderer sends it. Field types only (plus the stay's own date order), so
 * it can be `.partial()`'d for updates; the cross-field rules (dates in the future) stay in
 * `WatchService`. Stay dates are calendar dates `YYYY-MM-DD`.
 */
export const watchInputSchema = z.object({
  providerId: ProviderIdSchema,
  name: z.string().min(1),
  location: LocationRefSchema,
  stay: StayInputSchema,
  unitIds: z.array(z.string()).optional(),
  stayParams: StayParamsSchema.optional(),
  checkIntervalMinutes: z.number().int().positive().optional(),
  autoBook: z.boolean().optional(),
  notifyOnly: z.boolean().optional(),
  allowPartialMatch: z.boolean().optional(),
  maxPrice: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});
assertTypeEquals<z.input<typeof watchInputSchema>, WatchInput>(true);
assertTypeEquals<z.output<typeof watchInputSchema>, WatchInput>(true);

/** An update: any field but the provider. */
export const watchUpdateSchema = watchInputSchema.omit({ providerId: true }).partial();
assertTypeEquals<z.input<typeof watchUpdateSchema>, WatchUpdate>(true);
assertTypeEquals<z.output<typeof watchUpdateSchema>, WatchUpdate>(true);

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
    request: z.object({ id, updates: watchUpdateSchema }),
    args: {} as [id: number, updates: WatchUpdate],
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
