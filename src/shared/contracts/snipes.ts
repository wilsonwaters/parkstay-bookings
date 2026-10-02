/**
 * `snipes`: Site Sniper snipes of the local profile.
 */

import { z } from 'zod';
import { SnipeReleaseMode } from '../types/common.types';
import type { SiteSnipe, SiteSnipeInput, SnipeExecutionResult } from '../types/site-sniper.types';
import { CHANNELS } from './channels';
import { id, idPayload, Namespace } from './define';

const C = CHANNELS.snipes;

/**
 * A snipe as the renderer sends it. Field types only, so it can be `.partial()`'d for
 * updates; the cross-field rules (dates in order, a release time for scheduled releases)
 * stay in `SiteSniperService`.
 */
export const snipeInputSchema = z.object({
  name: z.string().min(1),
  campgroundId: z.string().min(1),
  campgroundName: z.string().optional(),
  targetSiteIds: z.array(z.string()).optional(),
  siteType: z.string().optional(),
  arrivalDate: z.date(),
  departureDate: z.date(),
  numAdult: z.number().int().nonnegative().optional(),
  numConcession: z.number().int().nonnegative().optional(),
  numChild: z.number().int().nonnegative().optional(),
  numInfant: z.number().int().nonnegative().optional(),
  numVehicle: z.number().int().nonnegative().optional(),
  postcode: z.string().optional(),
  releaseMode: z.nativeEnum(SnipeReleaseMode),
  releaseAt: z.date().optional(),
  queueEnabled: z.boolean().optional(),
  leadTimeSeconds: z.number().int().nonnegative().optional(),
  pollIntervalMs: z.number().int().positive().optional(),
  windowDurationMs: z.number().int().positive().optional(),
  maxAttempts: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

export const snipes = {
  list: { channel: C.list, request: z.void(), args: {} as [], response: {} as SiteSnipe[] },
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
    request: z.object({ id, updates: snipeInputSchema.partial() }),
    args: {} as [id: number, updates: Partial<SiteSnipeInput>],
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
