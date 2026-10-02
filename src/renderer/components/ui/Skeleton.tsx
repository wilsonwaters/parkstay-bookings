import { cx } from './cx';

export interface SkeletonProps {
  /** `text` is a 12 px line, `circle` an avatar, `rect` (default) a block. Size it with className. */
  shape?: 'rect' | 'text' | 'circle';
  className?: string;
}

/**
 * A placeholder the size of the content that is loading. Decorative (`aria-hidden`); pair it
 * with a Spinner or `aria-busy` on the region so the wait is announced. Static under reduced motion.
 */
export function Skeleton({ shape = 'rect', className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'block animate-shimmer bg-gradient-to-r from-surface-subtle via-canvas to-surface-subtle bg-[length:200%_100%]',
        shape === 'circle' ? 'rounded-full' : shape === 'text' ? 'h-3 rounded-sm' : 'rounded-md',
        className
      )}
    />
  );
}

export default Skeleton;
