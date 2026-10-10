import { useMemo } from 'react';
import { useLocationDetail } from '../../../api';
import type { SiteSnipe } from '../../../../shared/types/site-sniper.types';

/**
 * The place's own unit names by id, from its catalogue detail (main's 6-hour cache, shared with
 * the place and detail pages), so a held unit reads the same everywhere. Asks only while
 * `enabled`: a list asks only for held snipes.
 */
export function useUnitNames(
  snipe: Pick<SiteSnipe, 'locationKey'>,
  enabled = true
): ReadonlyMap<string, string> {
  const detail = useLocationDetail(enabled ? snipe.locationKey : null);
  const units = detail.data?.units;
  return useMemo(() => new Map((units ?? []).map((u) => [u.unitId, u.unitName])), [units]);
}
