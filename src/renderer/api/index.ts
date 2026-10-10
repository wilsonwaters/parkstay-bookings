/**
 * The renderer's data layer: React Query hooks over `window.api`. Components use these and
 * never call `window.api` themselves (architecture-notes §8).
 */

export {
  API_UNAVAILABLE_MESSAGE,
  ApiError,
  getApi,
  isApiAvailable,
  toApiError,
  unwrap,
  type ApiErrorCode,
} from './client';
export { queryKeys } from './queryKeys';
export { useApiEvent, useInvalidateOn, type InvalidateOnOptions } from './events';
export { useAppInfo, useOpenLogsFolder } from './app';
export {
  useAccessStatus,
  useProvider,
  useProviders,
  useProvidersWith,
  type ProviderCapabilities,
  type ProviderCapability,
  type ProviderManifest,
} from './providers';
export {
  NOTIFICATION_LIST_LIMIT,
  useClearNotifications,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationUpdates,
  useNotifications,
  useUnreadNotificationCount,
} from './notifications';
export { useDownloadUpdate, useInstallUpdate } from './updater';
export {
  CATALOG_STALE_TIME_MS,
  LOCATION_CHECK_STALE_TIME_MS,
  LOCATION_DETAIL_STALE_TIME_MS,
  LOCATION_SEARCH_LIMIT,
  LOCATION_SEARCH_MIN_CHARS,
  normaliseCatalogQuery,
  useCatalogAll,
  useCatalogRefresh,
  useCatalogSearch,
  useCatalogStatus,
  useCatalogUpdates,
  useLocationCheck,
  useLocationDetail,
  useLocationDetailUpdates,
  useLocationSearch,
} from './catalog';
export {
  WATCH_EVENT_COALESCE_MS,
  useCreateWatch,
  useDeleteWatch,
  useOpenWatchPayment,
  useRunWatchNow,
  useSetWatchActive,
  useUpdateWatch,
  useWatch,
  useWatches,
  useWatchUpdates,
} from './watches';
export { useAccountStatus } from './accounts';
export {
  useBooking,
  useBookings,
  useBookingUpdates,
  useCreateBooking,
  useDeleteBooking,
  useImportBooking,
} from './bookings';
