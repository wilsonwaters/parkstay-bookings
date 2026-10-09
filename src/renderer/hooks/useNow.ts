import { useCallback, useSyncExternalStore } from 'react';

/**
 * One shared clock per interval: every component that asks for `useNow(60_000)` re-renders
 * together once a minute from a single timer, which stops when the last one unmounts. U1 uses
 * a minute for "12 min ago"; Site Sniper's countdowns use a second.
 */
interface Ticker {
  now: number;
  listeners: Set<() => void>;
  timer?: ReturnType<typeof setInterval>;
}

const tickers = new Map<number, Ticker>();

function tickerFor(intervalMs: number): Ticker {
  let ticker = tickers.get(intervalMs);
  if (!ticker) {
    ticker = { now: Date.now(), listeners: new Set() };
    tickers.set(intervalMs, ticker);
  }
  return ticker;
}

function subscribe(intervalMs: number, listener: () => void): () => void {
  const ticker = tickerFor(intervalMs);
  ticker.listeners.add(listener);
  if (!ticker.timer) {
    ticker.now = Date.now();
    ticker.timer = setInterval(() => {
      ticker.now = Date.now();
      ticker.listeners.forEach((notify) => notify());
    }, intervalMs);
  }
  return () => {
    ticker.listeners.delete(listener);
    if (ticker.listeners.size === 0) {
      clearInterval(ticker.timer);
      ticker.timer = undefined;
    }
  };
}

/** The current time, updated every `intervalMs` (default one minute). */
export function useNow(intervalMs = 60_000): Date {
  const subscribeToTicker = useCallback(
    (listener: () => void) => subscribe(intervalMs, listener),
    [intervalMs]
  );
  const now = useSyncExternalStore(subscribeToTicker, () => tickerFor(intervalMs).now);
  return new Date(now);
}
