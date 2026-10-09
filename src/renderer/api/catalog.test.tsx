import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { createMockApi, fail, ok } from '@tests/utils/renderer/createMockApi';
import { catalogApi, placeApi, syncingStatus } from '@tests/utils/renderer/catalog';
import { createQueryClient } from '../app/queryClient';
import { queryKeys } from './queryKeys';
import {
  CATALOG_STALE_TIME_MS,
  normaliseCatalogQuery,
  useCatalogAll,
  useCatalogRefresh,
  useCatalogSearch,
  useCatalogStatus,
  useCatalogUpdates,
  useLocationCheck,
  useLocationDetail,
} from './catalog';

function wrapper(client = createQueryClient()) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('normaliseCatalogQuery', () => {
  it('asks for everything (limit 5000), leaving out blank text and empty filters', () => {
    expect(normaliseCatalogQuery({})).toEqual({ limit: 5000 });
    expect(
      normaliseCatalogQuery({ text: '  ', regions: [], kinds: [], amenities: [], providerIds: [] })
    ).toEqual({ limit: 5000 });
  });

  it('trims the text and sorts filter values, so equal searches share a cache entry', () => {
    expect(
      normaliseCatalogQuery({ text: ' Cape ', regions: ['Pilbara', 'Kimberley'], limit: 10 })
    ).toEqual({ text: 'Cape', regions: ['Kimberley', 'Pilbara'], limit: 5000 });
  });

  it('never sends the map area: Explore filters by area itself', () => {
    expect(normaliseCatalogQuery({ bbox: [112, -35, 129, -13] })).toEqual({ limit: 5000 });
  });
});

describe('catalog hooks', () => {
  it('useCatalogSearch calls catalog.search with the filters and limit 5000', async () => {
    const mock = createMockApi(catalogApi());
    window.api = mock.api;
    const { result } = renderHook(
      () => useCatalogSearch({ text: 'Cape', bookingModes: ['online'] }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mock.api.catalog.search).toHaveBeenCalledWith({
      text: 'Cape',
      bookingModes: ['online'],
      limit: 5000,
    });
    expect(result.current.data?.items.every((p) => p.bookingMode === 'online')).toBe(true);
    expect(CATALOG_STALE_TIME_MS).toBe(300_000);
  });

  it('keeps the previous results on screen while the next search loads', async () => {
    let release: () => void = () => undefined;
    const mock = createMockApi(catalogApi());
    const search = jest.mocked(mock.api.catalog.search);
    const real = search.getMockImplementation()!;
    window.api = mock.api;
    const { result, rerender } = renderHook(({ text }) => useCatalogSearch({ text }), {
      wrapper: wrapper(),
      initialProps: { text: '' },
    });
    await waitFor(() => expect(result.current.data?.total).toBe(169));

    search.mockImplementationOnce(
      (query) => new Promise((resolve) => (release = () => resolve(real(query))))
    );
    rerender({ text: 'Cape' });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.total).toBe(169);
    act(() => release());
    await waitFor(() => expect(result.current.data?.total).toBe(21));
    expect(result.current.isPlaceholderData).toBe(false);
  });

  it('useCatalogAll is the unfiltered search, sharing its cache entry', async () => {
    const mock = createMockApi(catalogApi());
    window.api = mock.api;
    const { result } = renderHook(() => ({ all: useCatalogAll(), search: useCatalogSearch({}) }), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.all.isSuccess).toBe(true));
    expect(result.current.search.data).toBe(result.current.all.data);
    expect(mock.api.catalog.search).toHaveBeenCalledTimes(1);
  });

  it('useCatalogStatus reads each provider’s sync state', async () => {
    window.api = createMockApi(catalogApi({ status: syncingStatus() })).api;
    const { result } = renderHook(() => useCatalogStatus(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.providers[0].syncing).toBe(true);
  });

  it('useCatalogStatus keeps asking while waiting, when given an interval', async () => {
    const mock = createMockApi(catalogApi({ status: syncingStatus() }));
    window.api = mock.api;
    renderHook(() => useCatalogStatus({ refetchInterval: 20 }), { wrapper: wrapper() });
    await waitFor(() => expect(mock.api.catalog.status).toHaveBeenCalledTimes(3));
  });

  it('useCatalogRefresh re-syncs and then reloads the catalogue queries', async () => {
    const mock = createMockApi(catalogApi());
    window.api = mock.api;
    const { result } = renderHook(
      () => ({ search: useCatalogSearch({}), refresh: useCatalogRefresh() }),
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(result.current.search.isSuccess).toBe(true));
    await act(() => result.current.refresh.mutateAsync('parkstay'));
    expect(mock.api.catalog.refresh).toHaveBeenCalledWith('parkstay');
    await waitFor(() => expect(mock.api.catalog.search).toHaveBeenCalledTimes(2));
  });

  it('useCatalogUpdates reloads the catalogue when a provider finishes a sync', async () => {
    const mock = createMockApi(
      catalogApi({ catalog: { search: jest.fn().mockResolvedValue(ok({ items: [], total: 0 })) } })
    );
    window.api = mock.api;
    renderHook(
      () => {
        useCatalogUpdates();
        return useCatalogSearch({});
      },
      { wrapper: wrapper() }
    );
    await waitFor(() => expect(mock.api.catalog.search).toHaveBeenCalledTimes(1));
    mock.emit('catalog:updated', {
      providerId: 'parkstay',
      count: 169,
      syncedAt: '2026-10-04T00:00:00Z',
    });
    await waitFor(() => expect(mock.api.catalog.search).toHaveBeenCalledTimes(2));
  });
});

describe('place hooks', () => {
  const STAY = { arrival: '2026-11-06', departure: '2026-11-08', adults: 2 };

  it('useLocationDetail asks catalog.get, and nothing without a key', async () => {
    const mock = createMockApi(placeApi());
    window.api = mock.api;
    const { result, rerender } = renderHook(({ key }) => useLocationDetail(key), {
      wrapper: wrapper(),
      initialProps: { key: null as string | null },
    });
    expect(mock.api.catalog.get).not.toHaveBeenCalled();
    rerender({ key: 'parkstay:20' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mock.api.catalog.get).toHaveBeenCalledWith('parkstay:20');
    expect(result.current.data?.units).toHaveLength(24);
  });

  it("shows the place's summary from a cached search while its detail loads", async () => {
    const mock = createMockApi(placeApi());
    window.api = mock.api;
    let release: () => void = () => undefined;
    const real = jest.mocked(mock.api.catalog.get).getMockImplementation()!;
    jest
      .mocked(mock.api.catalog.get)
      .mockImplementationOnce(
        (key) => new Promise((resolve) => (release = () => resolve(real(key))))
      );
    const client = createQueryClient();
    const { result: search } = renderHook(() => useCatalogAll(), { wrapper: wrapper(client) });
    await waitFor(() => expect(search.current.isSuccess).toBe(true));

    const { result } = renderHook(() => useLocationDetail('parkstay:20'), {
      wrapper: wrapper(client),
    });
    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data).toMatchObject({ name: 'Bungarra', units: [] });
    act(() => release());
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.units).toHaveLength(24);
  });

  it('useLocationCheck asks only once a stay is given, once per stay, and never retries itself', async () => {
    const checkLocation = jest.fn().mockResolvedValue(fail('parkstay: HTTP 500', 'PROVIDER_ERROR'));
    const mock = createMockApi(placeApi({ catalog: { checkLocation } }));
    window.api = mock.api;
    const { result, rerender } = renderHook(({ stay }) => useLocationCheck('parkstay:20', stay), {
      wrapper: wrapper(),
      initialProps: { stay: null as typeof STAY | null },
    });
    expect(checkLocation).not.toHaveBeenCalled();
    rerender({ stay: STAY });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(checkLocation).toHaveBeenCalledTimes(1);
    expect(checkLocation).toHaveBeenCalledWith('parkstay:20', STAY);
  });

  it('useLocationCheck does not ask again when the computer comes back online', async () => {
    const mock = createMockApi(placeApi());
    window.api = mock.api;
    const client = createQueryClient();
    const { result } = renderHook(() => useLocationCheck('parkstay:20', STAY), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const query = client
      .getQueryCache()
      .find({ queryKey: queryKeys.catalog.check('parkstay:20', STAY) });
    expect(query?.options).toMatchObject({ refetchOnReconnect: false, retry: false });
    // Even once stale, a reconnect asks nothing.
    act(() => {
      query?.invalidate();
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mock.api.catalog.checkLocation).toHaveBeenCalledTimes(1);
  });
});
