import { z } from 'zod';

export const settingsSchema = z.object({
  general: z.object({
    launchOnStartup: z.boolean(),
    minimizeToTray: z.boolean(),
    checkForUpdates: z.boolean(),
  }),
  notifications: z.object({
    enabled: z.boolean(),
    sound: z.boolean(),
    desktop: z.boolean(),
    soundFile: z.string(),
  }),
  watches: z.object({
    defaultInterval: z.number().int().min(1).max(60),
    maxConcurrent: z.number().int().min(1).max(50),
    autoBookEnabled: z.boolean(),
  }),
  stq: z.object({
    defaultInterval: z.number().int().min(1).max(30),
    maxAttempts: z.number().int().min(1),
    enabled: z.boolean(),
  }),
  ui: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    language: z.string(),
    dateFormat: z.string(),
  }),
  advanced: z.object({
    logLevel: z.enum(['error', 'warn', 'info', 'debug']),
    databasePath: z.string(),
    maxLogSize: z.number().int().positive(),
  }),
});

export type SettingsSchemaType = z.infer<typeof settingsSchema>;
