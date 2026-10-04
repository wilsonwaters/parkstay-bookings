/**
 * `provider_accounts`: one row per provider the person has an account with (migration v8).
 * Migration v8 creates the ParkStay row from the legacy `users` login. V6 keeps it up to
 * date when the person signs in or out; the row holds no secret.
 */

import type { AccountStatus, ProviderId } from '@shared/types';
import { BaseRepository, readInstant } from './base.repository';

export type ProviderAccountState = AccountStatus['state'];

export interface ProviderAccountRecord {
  providerId: ProviderId;
  status: ProviderAccountState;
  displayName?: string;
  email?: string;
  lastSignedInAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The fields to write. A field left `undefined` keeps its stored value (or the column
 * default for a new row); `null` clears it.
 */
export interface ProviderAccountUpsert {
  providerId: ProviderId;
  status?: ProviderAccountState;
  displayName?: string | null;
  email?: string | null;
  lastSignedInAt?: Date | null;
}

interface ProviderAccountRow {
  provider_id: string;
  status: string;
  display_name: string | null;
  email: string | null;
  last_signed_in_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export class ProviderAccountRepository extends BaseRepository<ProviderAccountRecord, string> {
  protected readonly tableName = 'provider_accounts';
  protected readonly idColumn = 'provider_id';

  /** The provider's account row, or null. */
  get(providerId: ProviderId): ProviderAccountRecord | null {
    return this.findById(providerId);
  }

  /** Every account row, by provider id. */
  list(): ProviderAccountRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM provider_accounts ORDER BY provider_id')
      .all() as ProviderAccountRow[];
    return rows.map((row) => this.mapRow(row));
  }

  /** Creates or updates the provider's row (see `ProviderAccountUpsert`) and returns it. */
  upsert(input: ProviderAccountUpsert, now: Date = new Date()): ProviderAccountRecord {
    return this.transaction(() => {
      const existing = this.db
        .prepare('SELECT * FROM provider_accounts WHERE provider_id = ?')
        .get(input.providerId) as ProviderAccountRow | undefined;
      const pick = <V>(value: V | null | undefined, stored: V | null): V | null =>
        value === undefined ? stored : value;
      const lastSignedInAt =
        input.lastSignedInAt === undefined
          ? (existing?.last_signed_in_at ?? null)
          : (input.lastSignedInAt?.toISOString() ?? null);

      this.db
        .prepare(
          `INSERT INTO provider_accounts
             (provider_id, status, display_name, email, last_signed_in_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (provider_id) DO UPDATE SET
             status = excluded.status,
             display_name = excluded.display_name,
             email = excluded.email,
             last_signed_in_at = excluded.last_signed_in_at,
             updated_at = excluded.updated_at`
        )
        .run(
          input.providerId,
          input.status ?? existing?.status ?? 'unknown',
          pick(input.displayName, existing?.display_name ?? null),
          pick(input.email, existing?.email ?? null),
          lastSignedInAt,
          now.toISOString(),
          now.toISOString()
        );
      const saved = this.get(input.providerId);
      if (!saved) throw new Error(`Failed to save the ${input.providerId} account`);
      return saved;
    });
  }

  protected mapRow(row: ProviderAccountRow): ProviderAccountRecord {
    return {
      providerId: row.provider_id,
      status: row.status as ProviderAccountState,
      ...(row.display_name !== null ? { displayName: row.display_name } : {}),
      ...(row.email !== null ? { email: row.email } : {}),
      ...(row.last_signed_in_at !== null
        ? { lastSignedInAt: readInstant(row.last_signed_in_at) }
        : {}),
      createdAt: readInstant(row.created_at) ?? new Date(0),
      updatedAt: readInstant(row.updated_at) ?? new Date(0),
    };
  }
}
