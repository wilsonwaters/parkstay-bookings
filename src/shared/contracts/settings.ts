/**
 * `settings`: typed application settings (architecture-notes §12.7).
 *
 * `SETTING_KEYS` is the registry: every key the renderer may read or write, with its value
 * schema and the `valueType`/`category` main stores it under. The renderer sends only
 * `(key, value)`; an unknown key or a value that fails the key's schema is rejected with
 * `VALIDATION`. Streams that add settings (U4, U5) add their keys here.
 */

import { z } from 'zod';
import { SettingCategory, SettingValueType } from '../types/common.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

export interface SettingDefinition {
  readonly schema: z.ZodTypeAny;
  readonly valueType: SettingValueType;
  readonly category: SettingCategory;
}

export const SETTING_KEYS = {
  /** Launch at login (written by `app.setAutoLaunch`). */
  launchOnStartup: {
    schema: z.boolean(),
    valueType: SettingValueType.BOOLEAN,
    category: SettingCategory.GENERAL,
  },
} as const satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof SETTING_KEYS;
export type SettingValue<K extends SettingKey = SettingKey> = z.infer<
  (typeof SETTING_KEYS)[K]['schema']
>;

const settingKey = z.enum(Object.keys(SETTING_KEYS) as [SettingKey, ...SettingKey[]]);

const setRequest = z
  .object({ key: settingKey, value: z.unknown() })
  .superRefine(({ key, value }, ctx) => {
    const result = SETTING_KEYS[key].schema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: issue.message,
          path: ['value', ...issue.path],
        });
      }
    }
  });

const C = CHANNELS.settings;

export const settings = {
  get: {
    channel: C.get,
    request: z.object({ key: settingKey }),
    args: {} as [key: SettingKey],
    response: {} as SettingValue | null,
  },
  set: {
    channel: C.set,
    request: setRequest,
    args: {} as [key: SettingKey, value: SettingValue],
    response: {} as boolean,
  },
  getAll: {
    channel: C.getAll,
    request: z.void(),
    args: {} as [],
    response: {} as Record<string, unknown>,
  },
} satisfies Namespace;
