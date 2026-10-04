import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { placesLabel } from '../../../components/locationFormat';
import { Button, Checkbox, Popover } from '../../../components/ui';
import { cx } from '../../../components/ui/cx';
import type { FacetOption } from './facets';

const CHIP_CLASS =
  'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors duration-fast ease-standard';
const CHIP_IDLE = 'border-border-strong bg-surface text-fg hover:border-fg';
const CHIP_ACTIVE = 'border-brand bg-brand-subtle text-brand-strong';

interface ChipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean;
}

const ChipButton = forwardRef<HTMLButtonElement, ChipButtonProps>(function ChipButton(
  { active, className, children, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_IDLE, className)}
      {...rest}
    >
      {children}
    </button>
  );
});

export interface FilterChipProps {
  /** "Region". With one chosen the chip reads "Region · 1" and is named "Region, 1 selected". */
  label: string;
  options: FacetOption[];
  selected: readonly string[];
  onChange: (selected: string[]) => void;
  /** Says how the options combine, under the list, e.g. "Places with all of these". */
  hint?: ReactNode;
}

/**
 * A filter chip that opens a Popover of checkboxes, each with how many places it gives.
 * Changes apply at once; Done or Escape closes it and returns focus to the chip. An option
 * that would give no places is disabled unless it is already chosen.
 */
export function FilterChip({ label, options, selected, onChange, hint }: FilterChipProps) {
  const id = useId();
  const count = selected.length;
  const toggle = (value: string, on: boolean) =>
    onChange(on ? [...selected, value] : selected.filter((v) => v !== value));

  return (
    <Popover
      label={label}
      className="w-72 !p-0"
      trigger={
        <ChipButton
          active={count > 0}
          aria-label={count > 0 ? `${label}, ${count} selected` : undefined}
        >
          {label}
          {count > 0 && <span className="tabular-nums">· {count}</span>}
          <ChevronDown size={16} aria-hidden="true" className="-mr-1" />
        </ChipButton>
      }
    >
      {({ close }) => (
        <div className="flex flex-col">
          <fieldset className="max-h-80 overflow-y-auto px-4 pb-2 pt-4">
            <legend className="sr-only">{label}</legend>
            <div className="flex flex-col gap-3">
              {options.map((option) => {
                const checked = selected.includes(option.value);
                return (
                  <Checkbox
                    key={option.value}
                    id={`${id}-${options.indexOf(option)}`}
                    checked={checked}
                    disabled={!checked && option.count === 0}
                    onChange={(event) => toggle(option.value, event.target.checked)}
                    aria-label={`${option.label}, ${placesLabel(option.count)}`}
                    label={
                      <>
                        {option.label}
                        <span className="ml-2 font-normal tabular-nums text-fg-muted">
                          {option.count}
                        </span>
                      </>
                    }
                  />
                );
              })}
            </div>
            {hint && <p className="mt-3 text-xs text-fg-muted">{hint}</p>}
          </fieldset>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <Button variant="ghost" size="sm" disabled={count === 0} onClick={() => onChange([])}>
              Clear
            </Button>
            <Button variant="secondary" size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Popover>
  );
}

export interface ToggleChipProps {
  label: string;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}

/** An on/off chip (`aria-pressed`), such as "Book online". */
export function ToggleChip({ label, pressed, onPressedChange }: ToggleChipProps) {
  return (
    <ChipButton active={pressed} aria-pressed={pressed} onClick={() => onPressedChange(!pressed)}>
      {pressed && <Check size={16} aria-hidden="true" className="-ml-1" />}
      {label}
    </ChipButton>
  );
}
