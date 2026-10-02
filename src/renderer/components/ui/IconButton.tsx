import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { buttonClassName, type ButtonSize, type ButtonVariant } from './Button';
import { Tooltip } from './Tooltip';
import { cx } from './cx';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  /** Required. Becomes the accessible name (`aria-label`) and the tooltip text. */
  label: string;
  /** A lucide icon, e.g. `<X />`. It is decorative; the label names the button. */
  icon: ReactNode;
  variant?: ButtonVariant;
  /** 32, 40 or 48 px square. */
  size?: ButtonSize;
}

const SQUARE: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 px-0',
  md: 'h-10 w-10 px-0',
  lg: 'h-12 w-12 px-0',
};

/** A button that shows only an icon. It always has a name, and a tooltip with the same text. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', className, type = 'button', ...rest },
  ref
) {
  return (
    <Tooltip content={label} describe={false}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={cx(buttonClassName({ variant, size }), SQUARE[size], className)}
        {...rest}
      >
        {icon}
      </button>
    </Tooltip>
  );
});

export default IconButton;
