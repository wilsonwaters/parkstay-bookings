import { useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  parseStayParams,
  STAY_PARAM_KEYS,
  stayParamsQuery,
  type StayParams,
} from '../../app/stayParams';

/** `search` with the stay's keys replaced by `stay`, other keys kept after them. */
export function withStay(search: string, stay: StayParams): string {
  const own = new Set<string>(STAY_PARAM_KEYS);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(stayParamsQuery(stay))) {
    query.append(key, String(value));
  }
  for (const [key, value] of new URLSearchParams(search)) {
    if (!own.has(key)) query.append(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

/**
 * The place page's stay, in its own query string so it can be shared and survives a reload.
 * Changes replace the history entry (Back still leaves the page in one step) and keep the
 * entry's state (where the page was opened from).
 */
export function usePlaceStay() {
  const location = useLocation();
  const navigate = useNavigate();
  const stay = useMemo(() => parseStayParams(location.search), [location.search]);

  const latest = useRef(location);
  latest.current = location;
  // The last write and the address it was made from, so two changes before the next render
  // build on each other.
  const pending = useRef<{ from: string; to: string } | null>(null);

  const setStay = useCallback(
    (patch: Partial<StayParams>) => {
      const { pathname, search, state } = latest.current;
      const base = pending.current?.from === search ? pending.current.to : search;
      const target = withStay(base, { ...parseStayParams(base), ...patch });
      if (target === base) return;
      pending.current = { from: search, to: target };
      navigate({ pathname, search: target }, { replace: true, state });
    },
    [navigate]
  );

  return { stay, setStay };
}
