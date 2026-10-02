import type { ReactNode } from 'react';

/**
 * The padding and width the pre-redesign pages used to get from the old sidebar layout. Each
 * legacy route renders inside one until the provider-ux stream rebuilds the page.
 */
export function LegacyPageFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-6 py-6 lg:px-8">{children}</div>;
}

export default LegacyPageFrame;
