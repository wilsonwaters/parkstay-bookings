import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { VisuallyHidden, type ButtonSize, type ButtonVariant } from './ui';
import { buttonClassName } from './ui/Button';
import { cx } from './ui/cx';

export interface ExternalLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'target' | 'rel' | 'children'> {
  /** An http(s) address on another site: a provider's page, its website. */
  href: string;
  children: ReactNode;
  /** Look like a Button of this variant (`primary` for the view's one call to action). */
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

/**
 * A link that leaves WA Stay for the system browser: `target="_blank"` with no referrer, which
 * the app window hands to the browser (`setWindowOpenHandler` → `shell.openExternal`). It ends
 * with the `ExternalLink` icon, and screen readers hear "(opens in your browser)". A text link
 * by default; pass `variant` for a link that looks like a Button.
 */
export function ExternalLink({
  href,
  children,
  variant,
  size = 'md',
  fullWidth,
  className,
  ...rest
}: ExternalLinkProps) {
  return (
    <a
      {...rest}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        variant
          ? buttonClassName({ variant, size, fullWidth, className })
          : cx(
              'inline-flex items-center gap-1 rounded-sm font-semibold text-brand-strong underline underline-offset-2 hover:text-fg',
              className
            )
      }
    >
      {children}
      <ExternalLinkIcon
        size={variant ? ICON_SIZE[size] : 16}
        aria-hidden="true"
        className="shrink-0"
      />
      <VisuallyHidden> (opens in your browser)</VisuallyHidden>
    </a>
  );
}

export default ExternalLink;
