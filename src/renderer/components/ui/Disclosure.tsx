import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './cx';
import { useDisclosure, type UseDisclosureOptions } from './useDisclosure';

export interface DisclosureProps extends UseDisclosureOptions {
  /** The always-visible button text, e.g. "Advanced options". */
  summary: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Show and hide a region with a button (`aria-expanded`, `aria-controls`). The chevron turns
 * when open, and stays still under reduced motion.
 */
export function Disclosure({ summary, children, className, ...options }: DisclosureProps) {
  const { open, buttonProps, panelProps } = useDisclosure(options);
  return (
    <div className={className}>
      <button
        {...buttonProps}
        className="flex w-full items-center justify-between gap-3 rounded-md py-2 text-left text-sm font-semibold text-fg hover:text-brand-strong"
      >
        <span>{summary}</span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={cx(
            'shrink-0 transition-transform duration-base ease-standard',
            open && 'motion-safe:rotate-180'
          )}
        />
      </button>
      <div {...panelProps} className="pb-2 pt-1 text-sm text-fg-secondary">
        {children}
      </div>
    </div>
  );
}

export default Disclosure;
