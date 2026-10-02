/**
 * `describeProviderContract(name, makeSubject)`: the conformance suite every provider runs.
 *
 *   describeProviderContract('parkstay', async () => ({
 *     provider: registry.get('parkstay'),
 *     sample: { externalId: '20', stay: { arrival: '2026-11-10', departure: '2026-11-12', adults: 1 } },
 *   }));
 *
 * It checks that the manifest is valid, the capabilities match the modules, location keys
 * round-trip, every module honours `AbortSignal`, failures are `ProviderError`s, and links
 * are absolute https URLs. Modules the provider does not have are skipped.
 */

import {
  isAbortError,
  ProviderError,
  type AccommodationProvider,
  type ProviderContext,
} from '@main/providers/sdk';
import { capabilityViolations, ProviderRegistry } from '@main/providers/registry';
import { ProviderManifestSchema, type StayQuery } from '@shared/types/provider.types';
import { makeLocationKey, parseLocationKey } from '@shared/utils/location-key';
import { createTestProviderContext } from './fake-provider';

export interface ProviderContractSubject {
  provider: AccommodationProvider;
  /**
   * A location and stay the provider can answer for. Defaults to the first catalogue location
   * and a two-night stay starting 30 days from today.
   */
  sample?: { externalId?: string; stay?: StayQuery };
  /** An external id the provider does not know. Default `does-not-exist-0`. */
  unknownExternalId?: string;
  /** Builds the context used for the registration check. Defaults to `createTestProviderContext`. */
  makeContext?: (id: string) => ProviderContext;
  /** Called after the suite (e.g. to stop a fixture server). */
  cleanup?: () => Promise<void> | void;
}

const day = (offset: number): string =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

/** A promise that rejects with an AbortError (the caller aborted). */
async function expectAbort(run: (signal: AbortSignal) => Promise<unknown>): Promise<void> {
  const before = new AbortController();
  before.abort();
  const early = await run(before.signal).then(
    () => 'resolved',
    (error: unknown) => error
  );
  expect(isAbortError(early)).toBe(true);

  const during = new AbortController();
  const pending = run(during.signal);
  during.abort();
  const late = await pending.then(
    () => 'resolved',
    (error: unknown) => error
  );
  expect(isAbortError(late)).toBe(true);
}

export function describeProviderContract(
  name: string,
  makeSubject: () => ProviderContractSubject | Promise<ProviderContractSubject>
): void {
  describe(`provider contract: ${name}`, () => {
    let subject: ProviderContractSubject;
    let provider: AccommodationProvider;
    let externalId: string;
    let stay: StayQuery;

    beforeAll(async () => {
      subject = await makeSubject();
      provider = subject.provider;
      stay = subject.sample?.stay ?? { arrival: day(30), departure: day(32), adults: 2 };
      externalId =
        subject.sample?.externalId ??
        (provider.catalog ? (await provider.catalog.listLocations())[0]?.externalId : '1') ??
        '1';
    });

    afterAll(async () => {
      await subject?.cleanup?.();
    });

    const unknownId = (): string => subject.unknownExternalId ?? 'does-not-exist-0';

    it('has a manifest that passes ProviderManifestSchema', () => {
      const parsed = ProviderManifestSchema.safeParse(provider.manifest);
      expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    });

    it('has a module behind every capability it claims', () => {
      expect(capabilityViolations(provider)).toEqual([]);
    });

    it('supports every release mode it describes, and describes some when it snipes', () => {
      const modes = provider.manifest.releaseModes ?? [];
      if (provider.manifest.capabilities.snipes) expect(modes.length).toBeGreaterThan(0);
      for (const mode of modes)
        expect([mode.id, provider.release?.supports(mode.id)]).toEqual([mode.id, true]);
    });

    it('registers in a ProviderRegistry under its manifest id', () => {
      const id = provider.manifest.id;
      const registry = new ProviderRegistry();
      const factory = Object.assign(() => provider, { id });
      const ctx = subject.makeContext?.(id) ?? createTestProviderContext(id);
      expect(registry.register(factory, ctx)).toBe(provider);
      expect(registry.list()).toEqual([provider.manifest]);
    });

    it('builds absolute https links (or none)', () => {
      const urls = [
        provider.links.location(externalId),
        provider.links.booking(externalId),
        provider.links.booking(externalId, stay),
        provider.links.manageBooking?.('REF-1') ?? null,
      ];
      for (const url of urls) {
        if (url !== null) expect(url).toMatch(/^https:\/\/[^/\s]+/);
      }
    });

    describe('catalog', () => {
      it('lists locations whose keys round-trip and name this provider', async () => {
        if (!provider.catalog) return;
        const locations = await provider.catalog.listLocations();
        expect(locations.length).toBeGreaterThan(0);
        for (const location of locations) {
          expect(location.providerId).toBe(provider.manifest.id);
          expect(location.key).toBe(makeLocationKey(provider.manifest.id, location.externalId));
          expect(parseLocationKey(location.key)).toEqual({
            providerId: provider.manifest.id,
            externalId: location.externalId,
          });
          expect(provider.manifest.locationKinds).toContain(location.kind);
        }
        expect(new Set(locations.map((l) => l.key)).size).toBe(locations.length);
      });

      it('returns a detail with the same key', async () => {
        if (!provider.catalog) return;
        const detail = await provider.catalog.getLocation(externalId);
        expect(detail.key).toBe(makeLocationKey(provider.manifest.id, externalId));
        expect(Array.isArray(detail.units)).toBe(true);
      });

      it('honours AbortSignal', async () => {
        const catalog = provider.catalog;
        if (!catalog) return;
        await expectAbort((signal) => catalog.listLocations(signal));
        await expectAbort((signal) => catalog.getLocation(externalId, signal));
      });

      it('rejects an unknown location with a ProviderError', async () => {
        if (!provider.catalog) return;
        await expect(provider.catalog.getLocation(unknownId())).rejects.toBeInstanceOf(
          ProviderError
        );
      });
    });

    describe('availability', () => {
      it('checks a stay: nights inside the stay, under the location key', async () => {
        if (!provider.availability) return;
        const result = await provider.availability.check(externalId, stay);
        expect(result.key).toBe(makeLocationKey(provider.manifest.id, externalId));
        expect(Number.isNaN(Date.parse(result.checkedAt))).toBe(false);
        for (const unit of result.units) {
          for (const night of unit.nights) {
            expect(night.date >= stay.arrival && night.date < stay.departure).toBe(true);
          }
        }
      });

      it('searches with keys of this provider', async () => {
        const search = provider.availability?.search;
        if (!search) return;
        const entries = await search(stay);
        for (const entry of entries)
          expect(parseLocationKey(entry.key).providerId).toBe(provider.manifest.id);
      });

      it('honours AbortSignal', async () => {
        const availability = provider.availability;
        if (!availability) return;
        await expectAbort((signal) => availability.check(externalId, stay, { signal }));
        if (availability.search) {
          const search = availability.search.bind(availability);
          await expectAbort((signal) => search(stay, signal));
        }
      });

      it('rejects an unknown location with a ProviderError', async () => {
        if (!provider.availability) return;
        await expect(provider.availability.check(unknownId(), stay)).rejects.toBeInstanceOf(
          ProviderError
        );
      });
    });

    describe('access gate', () => {
      it('reports its own status and unsubscribes listeners', () => {
        const gate = provider.access;
        if (!gate) return;
        expect(gate.status().providerId).toBe(provider.manifest.id);
        const listener = jest.fn();
        const unsubscribe = gate.onStatus(listener);
        expect(typeof unsubscribe).toBe('function');
        unsubscribe();
        const release = gate.holdOpen();
        release();
        release(); // a second release is harmless
      });

      it('honours AbortSignal in ensure()', async () => {
        const gate = provider.access;
        if (!gate) return;
        await expectAbort((signal) => gate.ensure({ signal }));
      });
    });

    describe('release policy', () => {
      it('computes a release for every described mode, honouring AbortSignal', async () => {
        const release = provider.release;
        if (!release) return;
        expect(release.pollFloorMs.window).toBeGreaterThan(0);
        expect(release.pollFloorMs.continuous).toBeGreaterThan(0);
        for (const mode of provider.manifest.releaseModes ?? []) {
          const at = await release.computeReleaseAt({
            mode: mode.id,
            externalId,
            stay,
            requestedAt: new Date(Date.now() + 86_400_000),
            now: new Date(),
          });
          expect(at === null || at instanceof Date).toBe(true);
        }
        const [first] = provider.manifest.releaseModes ?? [];
        if (first) {
          await expectAbort((signal) =>
            release.computeReleaseAt({ mode: first.id, externalId, stay, now: new Date(), signal })
          );
        }
      });
    });

    describe('holds', () => {
      it('honours AbortSignal', async () => {
        const holds = provider.holds;
        if (!holds) return;
        await expectAbort((signal) => holds.create({ externalId, stay }, signal));
      });
    });

    describe('auth', () => {
      it('has https sign-in origins and a signed-in check', async () => {
        const auth = provider.auth;
        if (!auth) return;
        expect(auth.signInUrl).toMatch(/^https:\/\//);
        for (const origin of auth.allowedOrigins) expect(origin).toMatch(/^https:\/\/[^/]+$/);
        expect(typeof auth.isSignedIn).toBe('function');
      });
    });
  });
}
