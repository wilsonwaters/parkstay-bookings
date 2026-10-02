/**
 * `watches` handlers. Watches belong to the local profile; the renderer never sends a user id.
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import { AppError } from '../../utils/app-error';
import type { Handle } from '../handle';

export function registerWatchesHandlers(handle: Handle, c: AppContainer): void {
  const { watches } = contract;

  handle(watches.list, () => c.watchService.list(c.profile.requireUserId()));

  handle(watches.get, ({ id }) => c.watchService.get(id));

  handle(watches.create, async (input) => {
    const watch = await c.watchService.create(c.profile.requireUserId(), input);
    c.scheduler.scheduleWatch(watch);
    return watch;
  });

  handle(watches.update, async ({ id, updates }) => {
    const watch = await c.watchService.update(id, updates);
    await c.scheduler.rescheduleWatch(id);
    return watch;
  });

  handle(watches.delete, async ({ id }) => {
    c.scheduler.unscheduleWatch(id);
    if (!(await c.watchService.delete(id))) throw new AppError('NOT_FOUND', 'Watch not found');
    return true;
  });

  handle(watches.activate, async ({ id }) => {
    await c.watchService.activate(id);
    await c.scheduler.rescheduleWatch(id);
  });

  handle(watches.deactivate, async ({ id }) => {
    await c.watchService.deactivate(id);
    c.scheduler.unscheduleWatch(id);
  });

  handle(watches.runNow, ({ id }) => c.scheduler.executeWatchNow(id));
}
