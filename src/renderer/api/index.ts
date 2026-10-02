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
export { useApiEvent, useInvalidateOn } from './events';
export { useAppInfo, useOpenLogsFolder } from './app';
export {
  useProvider,
  useProviders,
  useProvidersWith,
  type ProviderCapabilities,
  type ProviderCapability,
  type ProviderManifest,
} from './providers';
