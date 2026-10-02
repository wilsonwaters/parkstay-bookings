import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]',
  '[contenteditable="true"]',
].join(',');

/**
 * The elements Tab visits inside `container`, in DOM order: no negative tabindex, nothing
 * hidden or inert, and one radio per named group (the checked one, else the first), as the
 * browser does.
 */
export function getTabbables(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    const tabindex = el.getAttribute('tabindex');
    if (tabindex !== null && Number(tabindex) < 0) return false;
    return !el.closest('[hidden], [inert]');
  });
  return candidates.filter((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true;
    const group = candidates.filter(
      (o): o is HTMLInputElement =>
        o instanceof HTMLInputElement && o.type === 'radio' && o.name === el.name
    );
    return el === (group.find((r) => r.checked) ?? group[0]);
  });
}

export interface FocusTrapOptions {
  active: boolean;
  /** Focused on activation. Default: the first tabbable not marked `data-skip-initial-focus`. */
  initialFocusRef?: RefObject<HTMLElement>;
  /** Return focus to the element that had it on activation (default true). */
  restoreFocus?: boolean;
}

/**
 * Keeps keyboard focus inside `containerRef` while active: focus moves in on activation,
 * Tab and Shift+Tab wrap at the ends, and focus returns to the opener on deactivation or
 * unmount (when the opener is still in the document).
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement>,
  { active, initialFocusRef, restoreFocus = true }: FocusTrapOptions
): void {
  // Read in render, before any child can move focus (autoFocus runs before our effects).
  const opener = useRef<HTMLElement | null>(null);
  const wasActive = useRef(false);
  if (active && !wasActive.current) {
    opener.current =
      typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  }
  wasActive.current = active;

  useEffect(() => {
    const container = containerRef.current;
    if (!active || !container) return;
    const returnTo = opener.current;

    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else if (!container.contains(document.activeElement)) {
      const tabbables = getTabbables(container);
      const target =
        tabbables.find((el) => !el.hasAttribute('data-skip-initial-focus')) ??
        tabbables[0] ??
        container;
      target.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const tabbables = getTabbables(container);
      if (tabbables.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      const current = document.activeElement;
      const outside = !current || current === container || !container.contains(current);
      if (event.shiftKey && (current === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    container.addEventListener('keydown', onKeyDown);

    return () => {
      container.removeEventListener('keydown', onKeyDown);
      if (restoreFocus && returnTo && returnTo.isConnected) returnTo.focus();
    };
  }, [active, containerRef, initialFocusRef, restoreFocus]);
}
