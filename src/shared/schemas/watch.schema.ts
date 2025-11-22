import { z } from 'zod';

export const watchSchema = z
  .object({
    name: z.string().min(1).max(200),
    parkId: z.string().min(1),
    parkName: z.string().min(1).max(200),
    campgroundId: z.string().min(1),
    campgroundName: z.string().min(1).max(200),
    arrivalDate: z.date().min(new Date()),
    departureDate: z.date(),
    numGuests: z.number().int().min(1).max(50),
    preferredSites: z.array(z.string()).optional(),
    siteType: z.string().max(50).optional(),
    checkIntervalMinutes: z.number().int().min(1).max(60),
    autoBook: z.boolean(),
    notifyOnly: z.boolean(),
    maxPrice: z.number().positive().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.departureDate > data.arrivalDate, {
    message: 'Departure date must be after arrival date',
    path: ['departureDate'],
  })
  .refine((data) => !(data.autoBook && data.arrivalDate < new Date()), {
    message: 'Cannot auto-book for past dates',
    path: ['autoBook'],
  });

export type WatchSchemaType = z.infer<typeof watchSchema>;
