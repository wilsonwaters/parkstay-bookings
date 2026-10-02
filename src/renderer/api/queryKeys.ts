/**
 * React Query keys, built only here so invalidation always matches what was cached.
 * Each namespace has an `all` prefix: `invalidateQueries({ queryKey: queryKeys.catalog.all })`
 * clears everything under it.
 */

const providers = ['providers'] as const;
const catalog = ['catalog'] as const;
const notifications = ['notifications'] as const;
const app = ['app'] as const;
const updater = ['updater'] as const;

export const queryKeys = {
  providers: {
    all: providers,
    list: () => [...providers, 'list'] as const,
  },
  catalog: {
    all: catalog,
    search: (query: unknown) => [...catalog, 'search', query] as const,
    detail: (key: string) => [...catalog, 'detail', key] as const,
    availability: (stay: unknown, options?: unknown) =>
      [...catalog, 'availability', stay, options ?? {}] as const,
    status: () => [...catalog, 'status'] as const,
  },
  notifications: {
    all: notifications,
    list: (limit?: number) => [...notifications, 'list', { limit }] as const,
    unreadCount: () => [...notifications, 'unread-count'] as const,
  },
  app: {
    all: app,
    info: () => [...app, 'info'] as const,
  },
  updater: {
    all: updater,
    status: () => [...updater, 'status'] as const,
  },
} as const;
