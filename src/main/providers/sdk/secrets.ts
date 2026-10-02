/**
 * `ScopedSecretVault`: a provider's secrets (tokens and the like), encrypted at rest.
 *
 * A thin layer over the app's `SecretVault` (P5: `encrypt`/`decrypt` on Electron
 * `safeStorage`). It stores only the ciphertext, in the provider's own `KeyValueStore` under
 * `secret:<key>`, so secrets persist once that store is SQLite-backed (V2). The ciphertext
 * also names the provider and key it was written for, so a value copied to another provider
 * or key does not decrypt as theirs.
 */

import type { ProviderId } from '@shared/types/provider.types';
import type { KeyValueStore } from './kv-store';

/** The part of P5's `SecretVault` this layer uses. */
export interface SecretVaultLike {
  encrypt(plaintext: string): string;
  /** Throws when the ciphertext cannot be read. */
  decrypt(ciphertext: string): string;
}

export interface ScopedSecretVault {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export const SECRET_KEY_PREFIX = 'secret:';

interface SealedSecret {
  provider: ProviderId;
  key: string;
  value: string;
}

export function createScopedSecretVault({
  providerId,
  vault,
  store,
}: {
  providerId: ProviderId;
  vault: SecretVaultLike;
  store: KeyValueStore;
}): ScopedSecretVault {
  const storeKey = (key: string): string => `${SECRET_KEY_PREFIX}${key}`;

  return {
    async get(key) {
      const ciphertext = await store.get<string>(storeKey(key));
      if (ciphertext === undefined) return undefined;
      const sealed = JSON.parse(vault.decrypt(ciphertext)) as SealedSecret;
      if (sealed.provider !== providerId || sealed.key !== key) {
        throw new Error(`Secret "${key}" was not written by ${providerId}`);
      }
      return sealed.value;
    },
    async set(key, value) {
      const sealed: SealedSecret = { provider: providerId, key, value };
      await store.set(storeKey(key), vault.encrypt(JSON.stringify(sealed)));
    },
    async delete(key) {
      await store.delete(storeKey(key));
    },
  };
}

/**
 * Stands in for P5's `SecretVault` until it is wired into the container. It refuses to
 * store anything, so no secret is ever kept unencrypted.
 */
export class UnavailableSecretVault implements SecretVaultLike {
  encrypt(): string {
    throw new Error('Secret storage is not available yet');
  }

  decrypt(): string {
    throw new Error('Secret storage is not available yet');
  }
}

/** Tests only: a reversible fake cipher (XOR + base64), so ciphertext never equals plaintext. */
export class FakeSecretVault implements SecretVaultLike {
  private static readonly PREFIX = 'fake-vault:';

  encrypt(plaintext: string): string {
    return (
      FakeSecretVault.PREFIX +
      FakeSecretVault.flip(Buffer.from(plaintext, 'utf8')).toString('base64')
    );
  }

  decrypt(ciphertext: string): string {
    if (!ciphertext.startsWith(FakeSecretVault.PREFIX)) throw new Error('Unreadable secret');
    const bytes = Buffer.from(ciphertext.slice(FakeSecretVault.PREFIX.length), 'base64');
    return FakeSecretVault.flip(bytes).toString('utf8');
  }

  private static flip(bytes: Buffer): Buffer {
    return Buffer.from(bytes.map((b) => b ^ 0x5a));
  }
}
