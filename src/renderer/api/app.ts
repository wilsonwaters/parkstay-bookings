import { useMutation, useQuery } from '@tanstack/react-query';
import type { AppInfo } from '../../shared/contracts';
import { unwrap } from './client';
import { queryKeys } from './queryKeys';

/** Name, version and runtime details for About. They do not change while the app runs. */
export function useAppInfo(options: { enabled?: boolean } = {}) {
  return useQuery<AppInfo>({
    queryKey: queryKeys.app.info(),
    queryFn: () => unwrap((api) => api.app.getInfo()),
    staleTime: Infinity,
    enabled: options.enabled ?? true,
  });
}

/** Opens the folder holding WA Stay's log files in the system file manager. */
export function useOpenLogsFolder() {
  return useMutation({
    mutationFn: () => unwrap((api) => api.app.openLogsFolder()),
  });
}
