import { useEffect, useLayoutEffect, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { EventName, EventPayloads } from '../../shared/contracts';
import { getApi, isApiAvailable } from './client';

/**
 * Subscribes to a main-process event for as long as the component is mounted. The subscription
 * is made once per event name; the latest `callback` is always the one called, so passing an
 * inline function does not resubscribe. Outside the app (no `window.api`) it does nothing.
 */
export function useApiEvent<E extends EventName>(
  name: E,
  callback: (payload: EventPayloads[E]) => void
): void {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });

  useEffect(() => {
    if (!isApiAvailable()) return undefined;
    return getApi().events.on(name, (payload) => latest.current(payload));
  }, [name]);
}

/** Marks `queryKey` (and everything under it) stale whenever `event` arrives. */
export function useInvalidateOn(event: EventName, queryKey: QueryKey): void {
  const queryClient = useQueryClient();
  useApiEvent(event, () => {
    void queryClient.invalidateQueries({ queryKey });
  });
}
