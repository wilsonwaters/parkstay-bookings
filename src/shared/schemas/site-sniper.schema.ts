import { z } from 'zod';
import { SnipeReleaseMode } from '../types/common.types';

/**
 * Validation schema for creating/updating a Site Snipe.
 * Dates are validated as native Date objects.
 */
export const siteSnipeSchema = z
  .object({
    name: z.string().min(1).max(100),
    campgroundId: z.string().min(1),
    campgroundName: z.string().optional(),
    targetSiteIds: z.array(z.string()).optional().default([]),
    siteType: z.enum(['tent', 'campervan', 'caravan', 'all']).default('all'),
    arrivalDate: z.date(),
    departureDate: z.date(),
    numAdult: z.number().int().min(0).max(50).default(2),
    numConcession: z.number().int().min(0).max(50).default(0),
    numChild: z.number().int().min(0).max(50).default(0),
    numInfant: z.number().int().min(0).max(50).default(0),
    numVehicle: z.number().int().min(0).max(10).default(1),
    postcode: z
      .string()
      .regex(/^\d{4}$/)
      .optional(),
    releaseMode: z.nativeEnum(SnipeReleaseMode),
    releaseAt: z.date().optional(),
    queueEnabled: z.boolean().default(false),
    leadTimeSeconds: z.number().int().min(0).max(3600).default(120),
    pollIntervalMs: z.number().int().min(500).max(60000).default(1500),
    windowDurationMs: z.number().int().min(60000).max(7200000).default(900000),
    maxAttempts: z.number().int().min(0).default(0),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.departureDate > data.arrivalDate, {
    message: 'Departure date must be after arrival date',
    path: ['departureDate'],
  })
  .refine(
    (data) => data.releaseMode !== SnipeReleaseMode.SCHEDULED || data.releaseAt instanceof Date,
    {
      message: 'A release date/time is required for scheduled releases',
      path: ['releaseAt'],
    }
  );

export type SiteSnipeSchemaType = z.infer<typeof siteSnipeSchema>;
