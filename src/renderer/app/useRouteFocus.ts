import { useEffect, useRef, type RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useAnnounce } from '../components/ui';
import { pageTitleFor } from './routes';

/** How long a page that is still loading may take to show its `h1` and still get focus. */
export const HEADING_WAIT_MS = 2000;

function focusHeading(heading: HTMLElement) {
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  heading.focus();
}

/**
 * After every page change (pathname, not just the query string), moves focus to the new page's
 * `h1`, or to `<main>` when it has none yet, and announces the page title politely. The first
 * page is left alone, so the first Tab still reaches "Skip to content".
 *
 * Pages that load before they show their heading get a short grace period: if the `h1` turns up
 * while focus is still on `<main>` (or was lost to the body), focus moves to it.
 */
export function useRouteFocus(mainRef: RefObject<HTMLElement>): void {
  const { pathname } = useLocation();
  const announce = useAnnounce();
  // The page focus was last moved for. Comparing paths (rather than a "first run" flag) keeps the
  // first page alone under StrictMode too, where effects run twice on mount.
  const settledPath = useRef(pathname);

  useEffect(() => {
    if (settledPath.current === pathname) return undefined;
    settledPath.current = pathname;

    let observer: MutationObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // Wait a frame so the new page has rendered; a newer navigation cancels it, so only the
    // last page of a quick run of navigations takes focus.
    const frame = requestAnimationFrame(() => {
      const main = mainRef.current;
      if (!main) return;
      const heading = main.querySelector('h1');
      if (heading) focusHeading(heading);
      else main.focus();
      announce(heading?.textContent?.trim() || pageTitleFor(pathname));
      if (heading) return;

      observer = new MutationObserver(() => {
        const late = main.querySelector('h1');
        if (!late) return;
        observer?.disconnect();
        const active = document.activeElement;
        if (active === main || active === document.body || active === null) focusHeading(late);
      });
      observer.observe(main, { childList: true, subtree: true });
      timeout = setTimeout(() => observer?.disconnect(), HEADING_WAIT_MS);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (timeout) clearTimeout(timeout);
    };
  }, [pathname, mainRef, announce]);
}
