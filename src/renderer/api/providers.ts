import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { unwrap } from './client';
import { queryKeys } from './queryKeys';

import type {
  BooleanCapability,
  ProviderCapabilities,
  ProviderManifest,
} from '../../shared/types/provider.types';

export type { ProviderCapabilities, ProviderManifest };

/** The on/off capabilities a flow can filter providers by (`account`/`catalogMode` are not). */
export type ProviderCapability = BooleanCapability;

/** `providers.list()`: every registered provider's manifest. */
function listProviders(): Promise<ProviderManifest[]> {
  return unwrap((api) => api.providers.list());
}

/** Every registered provider's manifest, sorted by name in main. */
export function useProviders() {
  return useQuery({ queryKey: queryKeys.providers.list(), queryFn: listProviders });
}

/** One provider's manifest, or `undefined` while loading or when the id is unknown. */
export function useProvider(id: string) {
  const select = useCallback(
    (manifests: ProviderManifest[]) => manifests.find((m) => m.id === id),
    [id]
  );
  return useQuery({ queryKey: queryKeys.providers.list(), queryFn: listProviders, select });
}

/** The providers that offer `capability`, for a create flow's provider step (§12.9). */
export function useProvidersWith(capability: ProviderCapability) {
  const select = useCallback(
    (manifests: ProviderManifest[]) => manifests.filter((m) => m.capabilities[capability] === true),
    [capability]
  );
  return useQuery({ queryKey: queryKeys.providers.list(), queryFn: listProviders, select });
}
