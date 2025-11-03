import { z } from 'zod';

export const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-()]+$/)
    .optional(),
});

export type UserSchemaType = z.infer<typeof userSchema>;
