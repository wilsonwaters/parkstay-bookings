import type { ReactNode } from 'react';

/**
 * The gutter and width the pre-redesign pages used to get from the old sidebar layout, matching
 * the new pages (`px-6 py-8 lg:px-8`, max-w-7xl), so a legacy `h1` lines up with a new one. Each
 * legacy route renders inside one until the provider-ux stream rebuilds the page.
 *
 * The Watches and Site Sniper lists still carry their own `p-6` root from the old layout; the
 * frame cancels it (`[&>.p-6]:p-0`) rather than doubling the gutter, so their files stay as they
 * were.
 */
export function LegacyPageFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-6 py-8 lg:px-8 [&>.p-6]:p-0">{children}</div>;
}

export default LegacyPageFrame;
