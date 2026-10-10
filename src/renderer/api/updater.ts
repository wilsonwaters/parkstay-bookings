import { useMutation } from '@tanstack/react-query';
import { unwrap } from './client';

/**
 * Starts downloading the update main found. Progress, the finished download and errors arrive
 * as `updater:*` events.
 */
export function useDownloadUpdate() {
  return useMutation({ mutationFn: () => unwrap((api) => api.updater.downloadUpdate()) });
}

/** Quits WA Stay and installs the downloaded update. */
export function useInstallUpdate() {
  return useMutation({ mutationFn: () => unwrap((api) => api.updater.installUpdate()) });
}
