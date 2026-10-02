/**
 * IPC channel and event names: the zod-free half of the contract.
 *
 * The preload imports this module at runtime, so it must not import zod or any module that
 * does. Every channel is `<namespace>:<kebab-case-method>`. `index.ts` pairs each one with a
 * request schema and a response type, and a parity test keeps the two in step.
 */

export const CHANNELS = {
  // Transitional: V6 replaces it with per-provider accounts.
  auth: {
    storeCredentials: 'auth:store-credentials',
    getCredentials: 'auth:get-credentials',
    updateCredentials: 'auth:update-credentials',
    deleteCredentials: 'auth:delete-credentials',
    validateSession: 'auth:validate-session',
  },
  bookings: {
    list: 'bookings:list',
    get: 'bookings:get',
    create: 'bookings:create',
    update: 'bookings:update',
    delete: 'bookings:delete',
    sync: 'bookings:sync',
    syncAll: 'bookings:sync-all',
    import: 'bookings:import',
  },
  watches: {
    list: 'watches:list',
    get: 'watches:get',
    create: 'watches:create',
    update: 'watches:update',
    delete: 'watches:delete',
    activate: 'watches:activate',
    deactivate: 'watches:deactivate',
    runNow: 'watches:run-now',
  },
  snipes: {
    list: 'snipes:list',
    get: 'snipes:get',
    create: 'snipes:create',
    update: 'snipes:update',
    delete: 'snipes:delete',
    activate: 'snipes:activate',
    deactivate: 'snipes:deactivate',
    runNow: 'snipes:run-now',
  },
  notifications: {
    list: 'notifications:list',
    markRead: 'notifications:mark-read',
    delete: 'notifications:delete',
    clearAll: 'notifications:clear-all',
  },
  notifiers: {
    list: 'notifiers:list',
    get: 'notifiers:get',
    configure: 'notifiers:configure',
    enable: 'notifiers:enable',
    disable: 'notifiers:disable',
    test: 'notifiers:test',
  },
  gmail: {
    setCredentials: 'gmail:set-credentials',
    getCredentials: 'gmail:get-credentials',
    authorize: 'gmail:authorize',
    checkAuthStatus: 'gmail:check-auth-status',
    revokeAuth: 'gmail:revoke-auth',
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    getAll: 'settings:get-all',
  },
  app: {
    getInfo: 'app:get-info',
    openLogsFolder: 'app:open-logs-folder',
    setAutoLaunch: 'app:set-auto-launch',
    getAutoLaunch: 'app:get-auto-launch',
  },
  updater: {
    checkForUpdates: 'updater:check-for-updates',
    downloadUpdate: 'updater:download-update',
    installUpdate: 'updater:install-update',
    getStatus: 'updater:get-status',
  },
  // Transitional: V3 moves ParkStay behind the provider registry and the catalog namespace.
  parkstay: {
    searchCampgrounds: 'parkstay:search-campgrounds',
    getAllCampgrounds: 'parkstay:get-all-campgrounds',
    checkAvailability: 'parkstay:check-availability',
  },
  // Transitional: V3 replaces it with the provider access gate.
  queue: {
    check: 'queue:check',
    wait: 'queue:wait',
    getStatus: 'queue:get-status',
    clear: 'queue:clear',
  },
} as const;

export type Channels = typeof CHANNELS;
export type NamespaceName = keyof Channels;

/** Events main sends to the renderer. Payload types are in `events.ts`. */
export const EVENT_NAMES = [
  'notification:created',
  'watch:updated',
  'snipe:updated',
  'booking:updated',
  'updater:available',
  'updater:not-available',
  'updater:downloaded',
  'updater:progress',
  'updater:error',
  // Main emits it when an OS notification is clicked (U5); the renderer follows allow-listed paths only.
  'app:navigate',
  // Transitional: V3 replaces it with `provider:access-status`.
  'queue:status',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

export function isEventName(name: unknown): name is EventName {
  return typeof name === 'string' && (EVENT_NAMES as readonly string[]).includes(name);
}
