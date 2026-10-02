/**
 * `notifiers` handlers: outbound notification channels (email SMTP). Ported as they were;
 * P4 makes the SMTP password write-only.
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import { logger } from '../../utils/logger';
import type { Handle } from '../handle';

export function registerNotifiersHandlers(handle: Handle, c: AppContainer): void {
  const { notifiers } = contract;
  const repository = c.repositories.notifiers;
  const dispatcher = c.notifierDispatcher;

  handle(notifiers.list, () => repository.findAll());

  handle(notifiers.get, ({ channel }) => repository.findByChannel(channel));

  handle(notifiers.configure, (input) => {
    const notifier = repository.upsert(input);
    dispatcher.configureNotifier(
      input.channel,
      input.config as Record<string, unknown>,
      input.enabled || false
    );
    logger.info(`Notifier ${input.channel} configured`);
    return notifier;
  });

  handle(notifiers.enable, ({ channel }) => {
    const changed = repository.enable(channel);
    if (changed) dispatcher.loadNotifierConfigurations();
    return changed;
  });

  handle(notifiers.disable, ({ channel }) => {
    const changed = repository.disable(channel);
    if (changed) dispatcher.loadNotifierConfigurations();
    return changed;
  });

  handle(notifiers.test, async ({ channel }) => {
    const result = await dispatcher.testNotifier(channel);
    repository.updateLastTested(channel, result.success, result.error);
    return result;
  });
}
