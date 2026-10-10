import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProviderAccount, ProviderId } from '../../shared/types/provider.types';
import { unwrap } from './client';
import { useInvalidateOn } from './events';
import { queryKeys } from './queryKeys';

/**
 * The person's account with a provider, as last recorded (`accounts.list()`: no request to the
 * provider), or `undefined` while loading or for a provider without sign-in. Refreshed on
 * `account:updated`.
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

/**
 * Opens the provider's sign-in window (`accounts.signIn`); resolves with the account once the
 * person has signed in or closed the window, so check its `status`. The account lists refresh.
 */
export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId: ProviderId) => unwrap((api) => api.accounts.signIn(providerId)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all }),
  });
}

/** Asks the provider again whether the session is signed in (`accounts.status`): a Retry. */
export function useCheckAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (providerId: ProviderId) => unwrap((api) => api.accounts.status(providerId)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all }),
  });
}
