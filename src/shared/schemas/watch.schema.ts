import { z } from 'zod';

// Get today's date at midnight for comparison
const getTodayMidnight = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

export const watchSchema = z
  .object({
    name: z.string().min(1).max(200),
    parkId: z.string().min(1),
    parkName: z.string().min(1).max(200),
    campgroundId: z.string().min(1),
    campgroundName: z.string().min(1).max(200),
    arrivalDate: z.date().refine((date) => date >= getTodayMidnight(), {
      message: 'Arrival date must be today or in the future',
    }),
    departureDate: z.date(),
    numGuests: z.number().int().min(1).max(50),
    preferredSites: z.array(z.string()).optional(),
    siteType: z.preprocess(
      (val) => (Array.isArray(val) ? val.join(',') : val),
      z.string().max(200).optional()
    ),
    checkIntervalMinutes: z.number().int().refine(
      (val) => [60, 240, 720, 1440].includes(val),
      { message: 'Check interval must be 1 hour, 4 hours, 12 hours, or 24 hours' }
    ),
    autoBook: z.boolean(),
    notifyOnly: z.boolean(),
    maxPrice: z.preprocess(
      (val) => (val === '' || val === undefined || Number.isNaN(val) ? undefined : val),
      z.number().positive().optional()
    ),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.departureDate > data.arrivalDate, {
    message: 'Departure date must be after arrival date',
    path: ['departureDate'],
  })
  .refine((data) => !(data.autoBook && data.arrivalDate < getTodayMidnight()), {
    message: 'Cannot auto-book for past dates',
    path: ['autoBook'],
  });

export type WatchSchemaType = z.infer<typeof watchSchema>;
