/**
 * `snipes`: Site Sniper snipes of the local profile.
 */

import { z } from 'zod';
import { SnipeReleaseMode, SnipeStatus } from '../types/common.types';
import { ProviderIdSchema, StayParamsSchema } from '../types/provider.types';
import type {
  SiteSnipe,
  SiteSnipeInput,
  SiteSnipeUpdate,
  SnipeExecutionResult,
  SnipeListFilter,
} from '../types/site-sniper.types';
import { LocationRefSchema, StayInputSchema } from '../types/stay.types';
import { assertTypeEquals } from '../utils/type-equality';
import { CHANNELS } from './channels';
import { id, idPayload, Namespace } from './define';

const C = CHANNELS.snipes;

/**
 * A snipe as the renderer sends it. Field types only (plus the stay's own date order), so
 * it can be `.partial()`'d for updates; the cross-field rules (a release time for scheduled
 * releases) stay in `SiteSniperService`. Stay dates are calendar dates `YYYY-MM-DD`;
 * `releaseAt` is an instant.
 */
// Annotated, not inferred: the inferred type is the union of the enum's members, which is
// assignable to `SnipeReleaseMode` but not identical to it, so assertTypeEquals would fail.
const releaseModeSchema: z.ZodType<SnipeReleaseMode> = z.nativeEnum(SnipeReleaseMode);

export const snipeInputSchema = z.object({
  providerId: ProviderIdSchema,
  name: z.string().min(1),
  location: LocationRefSchema,
  stay: StayInputSchema,
  unitIds: z.array(z.string()).optional(),
  stayParams: StayParamsSchema.optional(),
  releaseMode: releaseModeSchema,
  releaseAt: z.date().optional(),
  accessGateEnabled: z.boolean().optional(),
  leadTimeSeconds: z.number().int().nonnegative().optional(),
  pollIntervalMs: z.number().int().positive().optional(),
  windowDurationMs: z.number().int().positive().optional(),
  maxAttempts: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});
assertTypeEquals<z.input<typeof snipeInputSchema>, SiteSnipeInput>(true);
assertTypeEquals<z.output<typeof snipeInputSchema>, SiteSnipeInput>(true);

/** An update: any field but the provider. */
export const snipeUpdateSchema = snipeInputSchema.omit({ providerId: true }).partial();
assertTypeEquals<z.input<typeof snipeUpdateSchema>, SiteSnipeUpdate>(true);
assertTypeEquals<z.output<typeof snipeUpdateSchema>, SiteSnipeUpdate>(true);

const snipeStatusSchema: z.ZodType<SnipeStatus> = z.nativeEnum(SnipeStatus);

/** `snipes.list`: every snipe of the local profile, or those of one provider or status. */
export const snipeListFilterSchema = z.object({
  providerId: ProviderIdSchema.optional(),
  status: snipeStatusSchema.optional(),
});
assertTypeEquals<z.input<typeof snipeListFilterSchema>, SnipeListFilter>(true);
assertTypeEquals<z.output<typeof snipeListFilterSchema>, SnipeListFilter>(true);

export const snipes = {
  list: {
    channel: C.list,
    // No payload lists everything.
    request: snipeListFilterSchema.optional(),
    args: {} as [filter?: SnipeListFilter],
    response: {} as SiteSnipe[],
  },
  get: {
    channel: C.get,
    request: idPayload,
    args: {} as [id: number],
    response: {} as SiteSnipe | null,
  },
  create: {
    channel: C.create,
    request: snipeInputSchema,
    args: {} as [input: SiteSnipeInput],
    response: {} as SiteSnipe,
  },
  update: {
    channel: C.update,
    request: z.object({ id, updates: snipeUpdateSchema }),
    args: {} as [id: number, updates: SiteSnipeUpdate],
    response: {} as SiteSnipe,
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
    response: {} as SnipeExecutionResult,
  },
} satisfies Namespace;
