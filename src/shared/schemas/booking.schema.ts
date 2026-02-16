import { z } from 'zod';

export const bookingSchema = z
  .object({
    bookingReference: z
      .string()
      .min(1)
      .max(50)
      .regex(/^[A-Z0-9]+$/),
    parkName: z.string().min(1).max(200),
    campgroundName: z.string().min(1).max(200),
    siteNumber: z.string().max(50).optional(),
    siteType: z.string().max(50).optional(),
    arrivalDate: z.date().min(new Date('2000-01-01')),
    departureDate: z.date(),
    numGuests: z.number().int().min(1).max(50),
    totalCost: z.number().positive().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((data) => data.departureDate > data.arrivalDate, {
    message: 'Departure date must be after arrival date',
    path: ['departureDate'],
  });

export type BookingSchemaType = z.infer<typeof bookingSchema>;
