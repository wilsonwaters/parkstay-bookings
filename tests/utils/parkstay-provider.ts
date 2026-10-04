/**
 * The real ParkStay provider module for tests: registered in its own `ProviderRegistry`
 * (so every manifest and module rule is checked), on a `NodeHttpClient` pointed at a
 * `startParkStayFixtureServer()`, with in-memory state, a recording logger and a fixed
 * clock (FIXED_NOW, 2 Oct 2026 10:00 AWST).
 */

import { createParkStayModules, parkstayManifest } from '@main/providers/parkstay';
import type { AccessGateTimings } from '@main/providers/parkstay/queue/access-gate';
import { ProviderRegistry, type ProviderWith } from '@main/providers/registry';
import {
  defineProvider,
  InMemoryKeyValueStore,
  NodeHttpClient,
  type ProviderContext,
} from '@main/providers/sdk';
import {
  createMemoryLogger,
  createTestProviderContext,
  FIXED_NOW,
  type MemoryLogger,
} from './fake-provider';
import type { ParkStayFixtureServer } from './parkstay-fixture-server';

export type ParkStayUnderTest = ProviderWith<'snipes'> &
  ProviderWith<'catalog'> &
  ProviderWith<'bulkAvailability'> &
  ProviderWith<'accessGate'>;

export interface TestParkStay {
  provider: ParkStayUnderTest;
  ctx: ProviderContext;
  http: NodeHttpClient;
  state: InMemoryKeyValueStore;
  logger: MemoryLogger;
  registry: ProviderRegistry;
}

export interface TestParkStayOptions {
  clock?: () => Date;
  accessTimings?: Partial<AccessGateTimings>;
}

export function createTestParkStay(
  server: Pick<ParkStayFixtureServer, 'endpoints'>,
  options: TestParkStayOptions = {}
): TestParkStay {
  const http = new NodeHttpClient({ providerId: 'parkstay' });
  const state = new InMemoryKeyValueStore();
  const logger = createMemoryLogger();
  const ctx = createTestProviderContext(parkstayManifest, {
    http,
    state,
    logger,
    clock: options.clock ?? (() => FIXED_NOW),
  });
  const factory = defineProvider(parkstayManifest, (c) =>
    createParkStayModules(c, { endpoints: server.endpoints, accessTimings: options.accessTimings })
  );
  const registry = new ProviderRegistry();
  const provider = registry.register(factory, ctx) as ParkStayUnderTest;
  return { provider, ctx, http, state, logger, registry };
}

/** The fixture's stay: Bungarra (id 20), 10–12 Nov 2026, one adult. */
export const BUNGARRA_STAY = { arrival: '2026-11-10', departure: '2026-11-12', adults: 1 };
