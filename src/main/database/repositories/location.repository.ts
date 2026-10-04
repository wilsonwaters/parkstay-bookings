/**
 * `locations`: the cached catalogue of every provider (migration v8), with the FTS5 index
 * `locations_fts` kept in sync by triggers. V5's catalogue service syncs it; search is V5's.
 *
 * Rows are written with `INSERT … ON CONFLICT DO UPDATE`, never `INSERT OR REPLACE`: a
 * REPLACE deletes the old row without firing the FTS delete trigger, which would leave a
 * stale entry in the index.
 */

import type { LocationDetail, LocationSummary, ProviderId } from '@shared/types';
import { locationKeyOf } from '@shared/types';
import { BaseRepository, readInstant } from './base.repository';

interface LocationRow {
  id: number;
  provider_id: string;
  external_id: string;
  name: string;
  kind: string;
  booking_mode: string;
  lat: number;
  lng: number;
  area_name: string | null;
  region: string | null;
  summary: string | null;
  description_html: string | null;
  image_urls: string | null;
  amenities: string | null;
  unit_count: number | null;
  info_url: string | null;
  booking_url: string | null;
  raw: string | null;
  fetched_at: string;
  detail: string | null;
  detail_fetched_at: string | null;
}

export interface UpsertLocationsResult {
  /** Rows inserted or updated. */
  upserted: number;
  /** The provider's rows that were not in the set, now deleted. */
  deleted: number;
}

export interface CachedLocationDetail {
  detail: LocationDetail;
  fetchedAt: Date;
}

export class LocationRepository extends BaseRepository<LocationSummary> {
  protected readonly tableName = 'locations';

  /**
   * Makes `summaries` the provider's whole catalogue, in one transaction: each one is
   * inserted or updated (a cached detail is kept), and the provider's rows that are not in
   * the set are deleted. Every summary must belong to `providerId`.
   */
  upsertMany(
    providerId: ProviderId,
    summaries: LocationSummary[],
    fetchedAt: Date
  ): UpsertLocationsResult {
    const foreign = summaries.find((s) => s.providerId !== providerId);
    if (foreign) {
      throw new Error(`Location ${foreign.key} does not belong to provider ${providerId}`);
    }

    const upsert = this.db.prepare(`
      INSERT INTO locations (
        provider_id, external_id, name, kind, booking_mode, lat, lng, area_name, region,
        summary, image_urls, amenities, unit_count, info_url, booking_url, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (provider_id, external_id) DO UPDATE SET
        name = excluded.name,
        kind = excluded.kind,
        booking_mode = excluded.booking_mode,
        lat = excluded.lat,
        lng = excluded.lng,
        area_name = excluded.area_name,
        region = excluded.region,
        summary = excluded.summary,
        image_urls = excluded.image_urls,
        amenities = excluded.amenities,
        unit_count = excluded.unit_count,
        info_url = excluded.info_url,
        booking_url = excluded.booking_url,
        fetched_at = excluded.fetched_at
    `);

    return this.transaction(() => {
      for (const s of summaries) {
        upsert.run(
          providerId,
          s.externalId,
          s.name,
          s.kind,
          s.bookingMode,
          s.lat,
          s.lng,
          s.area?.name ?? null,
          s.area?.region ?? null,
          s.summary ?? null,
          JSON.stringify(s.imageUrls),
          JSON.stringify(s.amenities),
          s.unitCount ?? null,
          s.infoUrl ?? null,
          s.bookingUrl ?? null,
          fetchedAt.toISOString()
        );
      }
      const { changes: deleted } = this.db
        .prepare(
          `DELETE FROM locations
           WHERE provider_id = ? AND external_id NOT IN (SELECT value FROM json_each(?))`
        )
        .run(providerId, JSON.stringify(summaries.map((s) => s.externalId)));
      return { upserted: summaries.length, deleted };
    });
  }

  /** The cached summary of one location, or null. */
  get(providerId: ProviderId, externalId: string): LocationSummary | null {
    const row = this.findRow(providerId, externalId);
    return row ? this.mapRow(row) : null;
  }

  /** Caches a location's detail. Returns false when the location is not in the catalogue. */
  setDetail(
    providerId: ProviderId,
    externalId: string,
    detail: LocationDetail,
    fetchedAt: Date
  ): boolean {
    const { changes } = this.db
      .prepare(
        `UPDATE locations SET detail = ?, description_html = ?, detail_fetched_at = ?
         WHERE provider_id = ? AND external_id = ?`
      )
      .run(
        JSON.stringify(detail),
        detail.descriptionHtml ?? null,
        fetchedAt.toISOString(),
        providerId,
        externalId
      );
    return changes > 0;
  }

  /** The cached detail and when it was fetched, or null when none is cached. */
  getDetail(providerId: ProviderId, externalId: string): CachedLocationDetail | null {
    const row = this.findRow(providerId, externalId);
    const detail = row ? this.parseJson<LocationDetail>(row.detail) : undefined;
    if (!row || !detail) return null;
    return { detail, fetchedAt: readInstant(row.detail_fetched_at) ?? new Date(0) };
  }

  /** How many locations each provider has cached. Providers with none are absent. */
  countByProvider(): Record<ProviderId, number> {
    const rows = this.db
      .prepare('SELECT provider_id, COUNT(*) AS n FROM locations GROUP BY provider_id')
      .all() as { provider_id: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.provider_id, r.n]));
  }

  private findRow(providerId: ProviderId, externalId: string): LocationRow | undefined {
    return this.db
      .prepare('SELECT * FROM locations WHERE provider_id = ? AND external_id = ?')
      .get(providerId, externalId) as LocationRow | undefined;
  }

  protected mapRow(row: LocationRow): LocationSummary {
    const strings = (json: string | null): string[] => {
      const value = this.parseJson<unknown>(json);
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
    };
    return {
      key: locationKeyOf(row.provider_id, row.external_id),
      providerId: row.provider_id,
      externalId: row.external_id,
      name: row.name,
      kind: row.kind as LocationSummary['kind'],
      bookingMode: row.booking_mode as LocationSummary['bookingMode'],
      lat: row.lat,
      lng: row.lng,
      ...(row.area_name !== null
        ? { area: { name: row.area_name, ...(row.region !== null ? { region: row.region } : {}) } }
        : {}),
      ...(row.summary !== null ? { summary: row.summary } : {}),
      imageUrls: strings(row.image_urls),
      amenities: strings(row.amenities),
      ...(row.unit_count !== null ? { unitCount: row.unit_count } : {}),
      ...(row.info_url !== null ? { infoUrl: row.info_url } : {}),
      ...(row.booking_url !== null ? { bookingUrl: row.booking_url } : {}),
    };
  }
}
