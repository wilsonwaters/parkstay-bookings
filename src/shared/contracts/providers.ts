/**
 * `providers`: the registered accommodation providers and their access gates.
 * Gate changes arrive as `provider:access-status` events.
 */

import { z } from 'zod';
import {
  ProviderIdSchema,
  type AccessStatus,
  type ProviderId,
  type ProviderManifest,
} from '../types/provider.types';
import { CHANNELS } from './channels';
import type { Namespace } from './define';

const C = CHANNELS.providers;

export const providers = {
  /** Every provider's manifest, sorted by name. */
  list: { channel: C.list, request: z.void(), args: {} as [], response: {} as ProviderManifest[] },
  /** The provider's queue state; `state: 'unsupported'` when it has no gate. */
  accessStatus: {
    channel: C.accessStatus,
    request: z.object({ providerId: ProviderIdSchema }),
    args: {} as [providerId: ProviderId],
    response: {} as AccessStatus,
  },
} satisfies Namespace;
