/**
 * `settings` handlers. Keys come from the typed registry (`SETTING_KEYS`, architecture-notes
 * §12.7); main stores each under the registry's `valueType` and `category`, never values the
 * renderer sends.
 */

import { contract, SETTING_KEYS } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import type { Handle } from '../handle';

export function registerSettingsHandlers(handle: Handle, c: AppContainer): void {
  const { settings } = contract;
  const repository = c.repositories.settings;

  handle(settings.get, ({ key }) => repository.getValue(key));

  handle(settings.set, ({ key, value }) => {
    const { valueType, category } = SETTING_KEYS[key];
    repository.set(key, value, valueType, category);
    return true;
  });

  handle(settings.getAll, () => repository.getAllAsObject());
}
