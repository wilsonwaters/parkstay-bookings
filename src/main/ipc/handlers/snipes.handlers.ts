/**
 * `snipes` handlers. Snipes belong to the local profile; the renderer never sends a user id.
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import { AppError } from '../../utils/app-error';
import type { Handle } from '../handle';

export function registerSnipesHandlers(handle: Handle, c: AppContainer): void {
  const { snipes } = contract;

  handle(snipes.list, () => c.siteSniperService.list(c.profile.requireUserId()));

  handle(snipes.get, ({ id }) => c.siteSniperService.get(id));

  handle(snipes.create, async (input) => {
    const snipe = await c.siteSniperService.create(c.profile.requireUserId(), input);
    c.scheduler.scheduleSnipe(snipe);
    return snipe;
  });

  handle(snipes.update, async ({ id, updates }) => {
    const snipe = await c.siteSniperService.update(id, updates);
    // Reschedule with the updated timing
    await c.scheduler.rescheduleSnipe(id);
    return snipe;
  });

  handle(snipes.delete, async ({ id }) => {
    c.scheduler.unscheduleSnipe(id);
    if (!(await c.siteSniperService.delete(id))) throw new AppError('NOT_FOUND', 'Snipe not found');
    return true;
  });

  handle(snipes.activate, async ({ id }) => {
    await c.siteSniperService.activate(id);
    await c.scheduler.rescheduleSnipe(id);
  });

  handle(snipes.deactivate, async ({ id }) => {
    await c.siteSniperService.deactivate(id);
    c.scheduler.unscheduleSnipe(id);
  });

  handle(snipes.runNow, ({ id }) => c.scheduler.executeSnipeNow(id));
}
