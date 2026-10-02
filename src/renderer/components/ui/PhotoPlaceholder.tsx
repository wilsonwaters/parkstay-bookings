import { Brushstroke } from './Brushstroke';
import { kindIcon } from './kindIcons';

export interface PhotoPlaceholderProps {
  /** What the missing photo would show, e.g. "No photo available for Lucky Bay". */
  'aria-label': string;
  /** Location kind, which picks the icon. Unknown kinds get a map pin. */
  kind?: string;
  /** `card` for list and map cards, `hero` for the location detail header. */
  size?: 'card' | 'hero';
  className?: string;
}

/**
 * The no-photo treatment: a soft ocean brush dab behind the kind icon, and a quiet caption.
 * It fills its container, so the parent sets the aspect ratio and corner radius.
 */
export function PhotoPlaceholder({
  'aria-label': label,
  kind,
  size = 'card',
  className,
}: PhotoPlaceholderProps) {
  const Icon = kindIcon(kind);
  const hero = size === 'hero';
  return (
    <div
      role="img"
      aria-label={label}
      className={[
        'flex h-full w-full flex-col items-center justify-center bg-surface-subtle text-brand',
        hero ? 'gap-3' : 'gap-2',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span
        className={['relative grid place-items-center', hero ? 'h-24 w-32' : 'h-14 w-20'].join(' ')}
      >
        <Brushstroke variant="dab" tone="ocean-soft" className="absolute inset-0 h-full w-full" />
        <Icon className="relative" size={hero ? 40 : 28} />
      </span>
      <span className={hero ? 'text-sm text-fg-muted' : 'text-xs text-fg-muted'}>No photo yet</span>
    </div>
  );
}

export default PhotoPlaceholder;
