import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { IconButton } from './IconButton';
import { cx } from './cx';
import { devWarn } from './dev';

export interface StepperProps {
  /** Names the group and the buttons ("Decrease adults"). */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: ReactNode;
  className?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A number nudged with − and + buttons, in a `role="group"` named by its label. The value is
 * an `<output aria-live="polite">`. Buttons disable at the limits; values from props outside
 * them are clamped (with a dev warning).
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  hint,
  className,
}: StepperProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  const decrease = useRef<HTMLButtonElement>(null);
  const increase = useRef<HTMLButtonElement>(null);
  const shown = clamp(value, min, max);
  const name = label.toLowerCase();

  useEffect(() => {
    if (shown !== value) {
      devWarn(`Stepper "${label}": value ${value} is outside ${min}–${max}; showing ${shown}.`);
    }
  }, [shown, value, label, min, max]);

  const change = (by: number) => {
    const next = clamp(shown + by, min, max);
    if (next === shown) return;
    onChange(next);
    // The pressed button disables at a limit; keep focus on the stepper.
    if (next <= min) increase.current?.focus();
    if (next >= max) decrease.current?.focus();
  };

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={hintId}
      className={cx('flex items-center justify-between gap-6', className)}
    >
      <div className="flex flex-col">
        <span id={labelId} className="text-base font-semibold text-fg">
          {label}
        </span>
        {hint && (
          <span id={hintId} className="text-sm text-fg-muted">
            {hint}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <IconButton
          ref={decrease}
          label={`Decrease ${name}`}
          icon={<Minus size={16} />}
          variant="secondary"
          size="sm"
          className="rounded-full"
          disabled={shown <= min}
          onClick={() => change(-step)}
        />
        <output aria-live="polite" className="w-6 text-center text-base tabular-nums text-fg">
          {shown}
        </output>
        <IconButton
          ref={increase}
          label={`Increase ${name}`}
          icon={<Plus size={16} />}
          variant="secondary"
          size="sm"
          className="rounded-full"
          disabled={shown >= max}
          onClick={() => change(step)}
        />
      </div>
    </div>
  );
}

export default Stepper;
