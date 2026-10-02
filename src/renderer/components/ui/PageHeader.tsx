import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cx } from './cx';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned actions, usually one primary Button. */
  actions?: ReactNode;
  /** A link back to the parent page, e.g. `{ label: 'Watches', href: '#/watches' }`. */
  back?: { label: string; href: string };
  /**
   * 1 (default): the page's only `h1`. Lower levels are only for specimens such as the
   * `/__design` gallery, where the page already has its `h1`.
   */
  headingLevel?: 1 | 2 | 3;
  className?: string;
}

/** The top of a page: its one `h1`, a line of description, actions and an optional back link. */
export function PageHeader({
  title,
  description,
  actions,
  back,
  headingLevel = 1,
  className,
}: PageHeaderProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <header className={cx('flex flex-col gap-3', className)}>
      {back && (
        <a
          href={back.href}
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-semibold text-brand-strong hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {back.label}
        </a>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <Heading className="text-2xl font-semibold text-fg">{title}</Heading>
          {description && <p className="mt-1 text-base text-fg-secondary">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}

export default PageHeader;
