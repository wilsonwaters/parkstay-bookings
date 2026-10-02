/**
 * `queue` handlers: transitional DBCA queue access (V3 replaces it). Status changes are
 * pushed as `queue:status` events, wired in the composition root.
 */

import { contract } from '@shared/contracts';
import type { AppContainer } from '../../app/container';
import type { Handle } from '../handle';

export function registerQueueHandlers(handle: Handle, c: AppContainer): void {
  const { queue } = contract;
  const service = c.queueService;

  handle(queue.check, () => service.checkOrCreateSession());

  handle(queue.wait, async () => {
    const result = await service.waitForActive();
    if (result.success && result.session) return result.session;
    throw new Error(result.error || 'Failed to obtain active session');
  });

  handle(queue.getStatus, () => ({
    session: service.getSession(),
    isActive: service.isSessionActive(),
    isExpired: service.isSessionExpired(),
    isWaiting: service.isWaitingInQueue(),
    estimatedWait: service.getEstimatedWaitFormatted(),
    expiryRemaining: service.getExpiryTimeRemaining(),
  }));

  handle(queue.clear, () => service.clearSession());
}
