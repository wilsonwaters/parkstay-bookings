import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ForwardedRef,
  type ReactNode,
} from 'react';
import { LoaderCircle } from 'lucide-react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
/** `danger-solid` is only for the confirm button of a destructive ConfirmDialog. */
type InternalVariant = ButtonVariant | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<InternalVariant, string> = {
  primary: 'bg-accent text-accent-fg [&:not(:disabled)]:hover:bg-accent-hover',
  secondary: 'border border-fg bg-surface text-fg [&:not(:disabled)]:hover:bg-surface-subtle',
  // Ghost inherits its text colour, so it reads correctly on tints (notices, toasts).
  ghost: 'bg-transparent text-inherit [&:not(:disabled)]:hover:bg-surface-inverse/[0.06]',
  danger: 'border border-danger bg-surface text-danger [&:not(:disabled)]:hover:bg-danger-subtle',
  'danger-solid': 'bg-danger text-fg-inverse [&:not(:disabled)]:hover:bg-danger-fg',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-5 text-base',
};

const ICON: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
}

export type ButtonAsButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    as?: 'button';
    /** Shows a spinner, sets `aria-busy` and disables the button. The label stays. */
    loading?: boolean;
  };

export type ButtonAsLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    as: 'a';
    href: string;
    loading?: never;
  };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
}: {
  variant?: InternalVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}): string {
  return cx(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-md font-semibold',
    'transition-colors duration-fast ease-standard',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress',
    VARIANT[variant],
    SIZE[size],
    fullWidth && 'w-full',
    className
  );
}

type InternalProps = Omit<ButtonProps, 'variant'> & { variant?: InternalVariant };

const ButtonImpl = forwardRef<HTMLButtonElement | HTMLAnchorElement, InternalProps>(
  function Button(props, ref) {
    const {
      as,
      variant,
      size = 'md',
      leadingIcon,
      trailingIcon,
      fullWidth,
      loading,
      className,
      children,
      ...rest
    } = props;
    const classes = buttonClassName({ variant, size, fullWidth, className });

    if (as === 'a') {
      return (
        <a
          ref={ref as ForwardedRef<HTMLAnchorElement>}
          className={classes}
          {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {leadingIcon}
          {children}
          {trailingIcon}
        </a>
      );
    }

    const {
      disabled,
      type = 'button',
      ...button
    } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
    return (
      <button
        ref={ref as ForwardedRef<HTMLButtonElement>}
        type={type}
        className={classes}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...button}
      >
        {loading ? (
          <LoaderCircle size={ICON[size]} className="animate-spin" aria-hidden="true" />
        ) : (
          leadingIcon
        )}
        {children}
        {trailingIcon}
      </button>
    );
  }
);

/** Internal: lets ConfirmDialog use the solid danger fill. Not exported from the barrel. */
export const ButtonBase = ButtonImpl as (
  props: InternalProps & { ref?: ForwardedRef<HTMLButtonElement | HTMLAnchorElement> }
) => JSX.Element;

/**
 * The one button. `primary` is the coral call to action (one per view), `secondary` an ink
 * outline, `ghost` for quiet actions and `danger` a crimson outline. `as="a"` renders a link.
 */
export const Button = ButtonImpl as (
  props: ButtonProps & { ref?: ForwardedRef<HTMLButtonElement | HTMLAnchorElement> }
) => JSX.Element;

export default Button;
