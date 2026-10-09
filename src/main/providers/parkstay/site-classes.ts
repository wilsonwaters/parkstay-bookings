/**
 * Campgrounds ParkStay lists by site class rather than by site (`site_type` 1 or 2). Lucky
 * Bay (Cape Le Grand, 43) is one: its 56 sites form one class, "One site - select on
 * arrival". For these, `campsite_availablity_view` has one entry per class
 * (`api.py:1375-1527`; checked live on 9 Oct 2026):
 *
 * - `type` is the class id and `name` its name. `id` is one site of the class: the first by
 *   name, or, while some site is free for the whole stay, any one of those (`v.pop()`,
 *   `api.py:1521`), so it changes from poll to poll. `classes` is empty.
 * - `availability` has one tuple per night, `[bookable, label, price, _, counts, date]`.
 *   While some site is free for the whole stay, every night is bookable
 *   (`api.py:1503-1524`). Otherwise a night is bookable only when no site of the class is
 *   taken; its label is the price while some site is free, `Booked` when every site is booked
 *   and `Unavailable` when every site is closed or not released (`api.py:1438-1497`).
 *   `counts` is `[booked, closed, other]` sites.
 * - `breakdown`, only when no site is free for the whole stay, lists each site of the class
 *   by name with its nights, `[free, label, price, _]` (`api.py:1429-1431,1500-1501`).
 *
 * A class is booked as a class: `create_booking` refuses a site at such a campground
 * ("Campground doesn't support per-site bookings.", `api.py:3112-3123`) and, given
 * `campsite_class`, holds the first site of the class that is free for the whole stay, or
 * answers "Campsite class unavailable for specified time period." (`utils.py:186-202`).
 *
 * So the module shows each class as one unit, `class:<class id>`, whatever site `id` the view
 * gave, and a hold for it posts `campsite_class`: ParkStay picks the free site.
 */

import type { UnitSummary } from '@shared/types/catalog.types';
import type { RawCampsite, RawCampsiteAvailabilityView } from './types';

const CLASS_UNIT = /^class:(\d+)$/;

/** Whether the view lists campsite classes (`site_type` 1 or 2) rather than sites. */
export function isClassListing(view: Pick<RawCampsiteAvailabilityView, 'site_type'>): boolean {
  return typeof view.site_type === 'number' && view.site_type !== 0;
}

/** A class entry's unit id: `class:<class id>`, or undefined for an entry without a class. */
export function classUnitId(entry: Pick<RawCampsite, 'type'>): string | undefined {
  const classId = entry.type as unknown;
  return typeof classId === 'number' || (typeof classId === 'string' && /^\d+$/.test(classId))
    ? `class:${classId}`
    : undefined;
}

/** `class:117` → `117`; undefined for a site's unit id. */
export function classIdOfUnit(unitId: string | undefined): string | undefined {
  return unitId ? CLASS_UNIT.exec(unitId)?.[1] : undefined;
}

/** A class entry as a `UnitSummary`: the class, never the one site the view named. */
export function toClassUnitSummary(entry: RawCampsite): UnitSummary {
  const equipment = Object.entries(entry.gearType ?? {})
    .filter(([, on]) => on === true)
    .map(([gear]) => gear);
  const description = entry.short_description?.trim();
  return {
    unitId: classUnitId(entry) ?? String(entry.id),
    unitName: entry.name,
    ...(Number.isFinite(entry.max_people) ? { maxPeople: entry.max_people } : {}),
    ...(Number.isFinite(entry.max_vehicles) ? { maxVehicles: entry.max_vehicles } : {}),
    equipment,
    ...(description ? { description } : {}),
  };
}

/**
 * Which nights a class can offer as stays: `free[site][night]` says whether a site of the
 * class is free that night. Each run of nights chosen lies on one site (ParkStay books a
 * class run on one site), and two runs are never next to each other, which would read as one
 * stay. The most nights win. A site free every night gives every night; one free night on a
 * different site each night gives every other night.
 */
export function bookableClassNights(
  free: readonly (readonly boolean[])[],
  nights: number
): boolean[] {
  // runFrom[i]: the earliest night a run ending on night i can start on one site, or -1.
  const runFrom: number[] = [];
  const runStart = free.map(() => -1);
  for (let i = 0; i < nights; i++) {
    let earliest = -1;
    free.forEach((site, s) => {
      if (site[i] !== true) {
        runStart[s] = -1;
        return;
      }
      if (runStart[s] < 0) runStart[s] = i;
      if (earliest < 0 || runStart[s] < earliest) earliest = runStart[s];
    });
    runFrom.push(earliest);
  }

  // best[k]: the most nights among the first k; from[k]: where the run ending at night k-1
  // starts when that night is taken, else -1. The longest run is always the best to take.
  const best = [0];
  const from = [-1];
  for (let k = 1; k <= nights; k++) {
    const start = runFrom[k - 1];
    const take = start < 0 ? -1 : (start === 0 ? 0 : best[start - 1]) + (k - start);
    if (take > best[k - 1]) {
      best.push(take);
      from.push(start);
    } else {
      best.push(best[k - 1]);
      from.push(-1);
    }
  }

  const chosen: boolean[] = Array(nights).fill(false);
  for (let k = nights; k > 0; ) {
    const start = from[k];
    if (start < 0) {
      k--;
      continue;
    }
    for (let i = start; i < k; i++) chosen[i] = true;
    k = start - 1;
  }
  return chosen;
}
