import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WindowApi } from '../../shared/contracts';
import type { APIResponse } from '../../shared/types/api.types';
import { unwrap } from './client';
import { queryKeys } from './queryKeys';

// TODO(V1): replace with shared ProviderManifest (src/shared/types/provider.types.ts) and the
// `providers` contract namespace once V1 (#19) merges. Until then this is the structural
// subset of architecture-notes §3 and §12 that the renderer reads.
export interface ProviderCapabilities {
  catalog: boolean;
  availability: boolean;
  bulkAvailability: boolean;
  watches: boolean;
  snipes: boolean;
  holds: boolean;
  bookingImport: boolean;
  accessGate?: boolean;
  account: 'none' | 'optional' | 'required-for-holds' | 'required';
}

// TODO(V1): replace with shared ProviderManifest.
export interface ProviderManifest {
  id: string;
  name: string;
  shortName: string;
  description: string;
  website: string;
  integration: 'api' | 'browser' | 'hybrid';
  brand: { color: string; monogram: string };
  locationKinds: string[];
  timezone: string;
  capabilities: ProviderCapabilities;
}

/** The on/off capabilities a flow can filter providers by (`account` is not one of them). */
export type ProviderCapability = {
  [K in keyof ProviderCapabilities]-?: NonNullable<ProviderCapabilities[K]> extends boolean
    ? K
    : never;
}[keyof ProviderCapabilities];

// TODO(V1): drop once `providers` is part of WindowApi.
type ProvidersNamespace = { list(): Promise<APIResponse<ProviderManifest[]>> };

/**
 * `providers.list()`. Until V1 exposes the `providers` namespace in the preload, there are no
 * manifests to show, so this resolves to an empty list instead of failing: provider badges fall
 * back to their unknown variant and nothing else breaks.
 */
function listProviders(): Promise<ProviderManifest[]> {
  return unwrap((api) => {
    const providers = (api as WindowApi & { providers?: ProvidersNamespace }).providers;
    if (!providers) return Promise.resolve({ success: true, data: [] });
    return providers.list();
  });
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
