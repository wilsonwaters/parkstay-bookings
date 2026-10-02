/**
 * `ProviderRegistry`: the one place core services find providers (architecture-notes §3).
 *
 * `register` validates the manifest with zod and checks that every capability the manifest
 * claims has the module behind it, so a core service that checked a capability (or used
 * `require`) can rely on the module being there.
 */

import {
  ProviderIdSchema,
  ProviderManifestSchema,
  type BooleanCapability,
  type ProviderId,
  type ProviderManifest,
} from '@shared/types/provider.types';
import type { ProviderContext, ProviderLogger } from './sdk/context';
import {
  ProviderCapabilityError,
  ProviderRegistrationError,
  UnknownProviderError,
} from './sdk/errors';
import type {
  AccessGate,
  AccommodationProvider,
  AvailabilityModule,
  BookingsModule,
  CatalogModule,
  HoldsModule,
  ProviderFactory,
  ReleasePolicy,
} from './sdk/provider';

/** The modules each capability guarantees once a provider is registered. */
interface CapabilityModules {
  catalog: { catalog: CatalogModule };
  availability: { availability: AvailabilityModule };
  watches: { availability: AvailabilityModule };
  bulkAvailability: {
    availability: AvailabilityModule & Required<Pick<AvailabilityModule, 'search'>>;
  };
  holds: { holds: HoldsModule };
  snipes: { availability: AvailabilityModule; holds: HoldsModule; release: ReleasePolicy };
  bookingImport: { bookings: BookingsModule & Required<Pick<BookingsModule, 'get'>> };
  accessGate: { access: AccessGate };
}

export type ProviderWith<C extends BooleanCapability> = AccommodationProvider &
  CapabilityModules[C];

interface ConsistencyRule {
  /** Short name, used in tests and messages. */
  rule: string;
  applies(manifest: ProviderManifest): boolean;
  satisfied(provider: AccommodationProvider): boolean;
  needs: string;
}

const hasCheck = (p: AccommodationProvider): boolean => typeof p.availability?.check === 'function';

/** Capability → module rules. Exported so the contract suite can name them. */
export const CONSISTENCY_RULES: readonly ConsistencyRule[] = [
  {
    rule: 'catalog',
    applies: (m) => m.capabilities.catalog,
    satisfied: (p) => p.catalog !== undefined,
    needs: 'catalog',
  },
  {
    rule: 'availability/watches',
    applies: (m) => m.capabilities.availability || m.capabilities.watches,
    satisfied: hasCheck,
    needs: 'availability.check',
  },
  {
    rule: 'bulkAvailability',
    applies: (m) => m.capabilities.bulkAvailability,
    satisfied: (p) => typeof p.availability?.search === 'function',
    needs: 'availability.search',
  },
  {
    rule: 'holds',
    applies: (m) => m.capabilities.holds,
    satisfied: (p) => p.holds !== undefined,
    needs: 'holds',
  },
  {
    rule: 'snipes',
    applies: (m) => m.capabilities.snipes,
    satisfied: (p) => hasCheck(p) && p.holds !== undefined && p.release !== undefined,
    needs: 'availability, holds and release',
  },
  {
    rule: 'accessGate',
    applies: (m) => m.capabilities.accessGate,
    satisfied: (p) => p.access !== undefined,
    needs: 'access',
  },
  {
    rule: 'account',
    applies: (m) => m.capabilities.account !== 'none',
    satisfied: (p) => p.auth !== undefined,
    needs: 'auth',
  },
  {
    rule: 'bookingImport',
    applies: (m) => m.capabilities.bookingImport,
    satisfied: (p) => typeof p.bookings?.get === 'function',
    needs: 'bookings.get',
  },
];

/** Every consistency rule the provider breaks, as messages; empty when it is consistent. */
export function capabilityViolations(provider: AccommodationProvider): string[] {
  return CONSISTENCY_RULES.filter(
    (r) => r.applies(provider.manifest) && !r.satisfied(provider)
  ).map((r) => `capability ${r.rule} needs ${r.needs}`);
}

function capabilityOn(manifest: ProviderManifest, capability: BooleanCapability): boolean {
  return manifest.capabilities[capability] === true;
}

const byName = (a: ProviderManifest, b: ProviderManifest): number =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id);

export interface ProviderRegistryOptions {
  logger?: ProviderLogger;
}

export class ProviderRegistry {
  private readonly providers = new Map<ProviderId, AccommodationProvider>();
  private readonly logger?: ProviderLogger;

  constructor(options: ProviderRegistryOptions = {}) {
    this.logger = options.logger;
  }

  /** Builds the provider with `ctx` and adds it. Throws `ProviderRegistrationError`. */
  register(factory: ProviderFactory, ctx: ProviderContext): AccommodationProvider {
    const id = factory.id;
    if (!ProviderIdSchema.safeParse(id).success) {
      throw new ProviderRegistrationError(String(id), 'invalid provider id');
    }
    if (this.providers.has(id)) {
      throw new ProviderRegistrationError(id, 'a provider with this id is already registered');
    }
    if (ctx.id !== id) {
      throw new ProviderRegistrationError(id, `its context belongs to "${ctx.id}"`);
    }

    let provider: AccommodationProvider;
    try {
      provider = factory(ctx);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new ProviderRegistrationError(id, `its factory threw: ${reason}`, error);
    }

    const problem = this.problemWith(id, provider);
    if (problem) {
      // Release anything the half-built provider started.
      this.disposeQuietly(provider);
      throw new ProviderRegistrationError(id, problem);
    }

    this.providers.set(id, provider);
    return provider;
  }

  get(id: ProviderId): AccommodationProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new UnknownProviderError(id);
    return provider;
  }

  tryGet(id: ProviderId): AccommodationProvider | undefined {
    return this.providers.get(id);
  }

  /** Every manifest, sorted by name. */
  list(): ProviderManifest[] {
    return [...this.providers.values()].map((p) => p.manifest).sort(byName);
  }

  /** The providers with `capability` turned on, sorted by name. */
  withCapability<C extends BooleanCapability>(capability: C): ProviderWith<C>[] {
    return [...this.providers.values()]
      .filter((p) => capabilityOn(p.manifest, capability))
      .sort((a, b) => byName(a.manifest, b.manifest)) as ProviderWith<C>[];
  }

  /** The provider, which must have `capability`. Throws `UnknownProviderError` or `ProviderCapabilityError`. */
  require<C extends BooleanCapability>(id: ProviderId, capability: C): ProviderWith<C> {
    const provider = this.get(id);
    if (!capabilityOn(provider.manifest, capability)) {
      throw new ProviderCapabilityError(id, capability);
    }
    return provider as ProviderWith<C>;
  }

  /**
   * Disposes every provider, even when some fail, and empties the registry. Each `dispose`
   * starts synchronously, before this returns its promise. Failures are logged; this never
   * rejects, so it is safe on quit.
   */
  async disposeAll(): Promise<void> {
    const providers = [...this.providers.values()];
    this.providers.clear();
    const results = await Promise.allSettled(providers.map((p) => this.startDispose(p)));
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger?.error(`Provider ${providers[i].manifest.id} failed to dispose`, result.reason);
      }
    });
  }

  private problemWith(id: ProviderId, provider: AccommodationProvider): string | undefined {
    const parsed = ProviderManifestSchema.safeParse(provider?.manifest);
    if (!parsed.success) {
      const paths = parsed.error.issues.map(
        (i) => `${i.path.length ? i.path.join('.') : 'manifest'}: ${i.message}`
      );
      return `invalid manifest (${paths.join('; ')})`;
    }
    if (provider.manifest.id !== id) {
      return `its manifest id "${provider.manifest.id}" does not match`;
    }
    if (
      typeof provider.links?.location !== 'function' ||
      typeof provider.links?.booking !== 'function'
    ) {
      return 'it has no links';
    }
    const violations = capabilityViolations(provider);
    return violations.length ? violations.join('; ') : undefined;
  }

  private startDispose(provider: AccommodationProvider): Promise<void> {
    try {
      return Promise.resolve(provider.dispose?.());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private disposeQuietly(provider: AccommodationProvider): void {
    this.startDispose(provider).catch((error) =>
      this.logger?.warn(`Provider ${provider.manifest?.id} failed to dispose`, error)
    );
  }
}
