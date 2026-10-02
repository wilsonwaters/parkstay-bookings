import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createMockApi } from '@tests/utils/renderer/createMockApi';
import { createQueryClient } from '../app/queryClient';
import { useApiEvent, useInvalidateOn } from './events';

function install(mock = createMockApi()) {
  window.api = mock.api;
  return mock;
}

describe('useApiEvent', () => {
  it('subscribes once and unsubscribes once on unmount', () => {
    const mock = install();
    const { unmount } = renderHook(() => useApiEvent('updater:available', () => undefined));
    expect(window.api.events.on).toHaveBeenCalledTimes(1);
    expect(window.api.events.on).toHaveBeenCalledWith('updater:available', expect.any(Function));
    expect(mock.subscriberCount('updater:available')).toBe(1);

    unmount();
    expect(mock.unsubscribes).toHaveLength(1);
    expect(mock.unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(mock.subscriberCount('updater:available')).toBe(0);
  });

  it('calls the latest callback without resubscribing when it changes', () => {
    const mock = install();
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }) => useApiEvent('updater:downloaded', cb), {
      initialProps: { cb: first },
    });
    rerender({ cb: second });

    mock.emit('updater:downloaded', { version: '2.1.0' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ version: '2.1.0' });
    expect(window.api.events.on).toHaveBeenCalledTimes(1);
    expect(mock.unsubscribes[0]).not.toHaveBeenCalled();
  });

  it('resubscribes when the event name changes', () => {
    const mock = install();
    const { rerender } = renderHook(({ name }) => useApiEvent(name, () => undefined), {
      initialProps: { name: 'updater:available' as 'updater:available' | 'updater:error' },
    });
    rerender({ name: 'updater:error' });
    expect(mock.unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(mock.subscriberCount('updater:error')).toBe(1);
  });

  it('does nothing outside the app, where there is no window.api', () => {
    Object.defineProperty(window, 'api', { value: undefined, configurable: true, writable: true });
    expect(() =>
      renderHook(() => useApiEvent('notification:created', () => undefined)).unmount()
    ).not.toThrow();
  });
});

describe('useInvalidateOn', () => {
  it('marks the query stale when the event arrives', () => {
    const mock = install();
    const client = createQueryClient();
    client.setQueryData(['notifications', 'list', { limit: 20 }], []);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    renderHook(() => useInvalidateOn('notification:created', ['notifications']), { wrapper });

    const state = () => client.getQueryState(['notifications', 'list', { limit: 20 }]);
    expect(state()?.isInvalidated).toBe(false);
    mock.emit('notification:created', {} as never);
    expect(state()?.isInvalidated).toBe(true);
  });
});
