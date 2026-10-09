import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProviderAccount, ProviderId } from '../../shared/types/provider.types';
import { unwrap } from './client';
import { useInvalidateOn } from './events';
import { queryKeys } from './queryKeys';

/**
 * The person's account with a provider, as last recorded (`accounts.list()`: no request to the
 * provider), or `undefined` while loading or for a provider without sign-in. Refreshed on
 * `account:updated`. U2 adds sign-in here.
 */
export function useAccountStatus(providerId: ProviderId | undefined) {
  useInvalidateOn('account:updated', queryKeys.accounts.all);
  const select = useCallback(
    (accounts: ProviderAccount[]) => accounts.find((a) => a.providerId === providerId),
    [providerId]
  );
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: () => unwrap((api) => api.accounts.list()),
    select,
    enabled: Boolean(providerId),
  });
}
