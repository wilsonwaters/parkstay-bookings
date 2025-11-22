import { z } from 'zod';

export const stqSchema = z.object({
  bookingId: z.number().int().positive(),
  bookingReference: z.string().min(1).max(50).regex(/^[A-Z0-9]+$/),
  checkIntervalMinutes: z.number().int().min(1).max(30),
  maxAttempts: z.number().int().min(1),
  notes: z.string().max(500).optional(),
});

export type STQSchemaType = z.infer<typeof stqSchema>;
