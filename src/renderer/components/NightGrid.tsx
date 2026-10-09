import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  ArrowLeftRight,
  Check,
  CircleQuestionMark,
  Clock,
  Minus,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { NightState, NightStatus, UnitAvailability } from '../../shared/types/provider.types';
import {
  DEFAULT_UNIT_NOUN,
  isFullyAvailable,
  isSplitNight,
  NIGHT_STATE_LABELS,
  nightCellText,
  nightHeading,
  nightOf,
  noFullRowsMessage,
  stayNights,
  stayRangeLabel,
  summariseAvailability,
  summaryLine,
  summaryNotes,
  splitNightLabel,
  type UnitNoun,
} from './nightGrid';
import { Button, Switch, VisuallyHidden } from './ui';
import { cx } from './ui/cx';

/** Rows shown before "Show all". */
export const NIGHT_GRID_ROWS = 10;

const STATE_LOOK: Record<NightState, { icon: LucideIcon; cell: string; glyph: string }> = {
  available: {
    icon: Check,
    cell: 'bg-available-subtle text-available-fg',
    glyph: 'text-available',
  },
  booked: { icon: X, cell: 'bg-surface-subtle text-fg-muted', glyph: '' },
  closed: { icon: Minus, cell: 'bg-surface-subtle text-fg-muted', glyph: '' },
  'not-released': { icon: Clock, cell: 'bg-warning-subtle text-warning-fg', glyph: '' },
  unknown: {
    icon: CircleQuestionMark,
    cell: 'border border-border bg-surface text-fg-muted',
    glyph: '',
  },
};

/** A cell's look: its state, or `split` (free on another unit than the nights next to it). */
type CellKind = NightState | 'split';

const SPLIT_LOOK = {
  icon: ArrowLeftRight,
  cell: 'border border-dashed border-available bg-surface text-available-fg',
  glyph: 'text-available',
};

const lookOf = (kind: CellKind) => (kind === 'split' ? SPLIT_LOOK : STATE_LOOK[kind]);

const LEGEND_ORDER: CellKind[] = [
  'available',
  'split',
  'booked',
  'closed',
  'not-released',
  'unknown',
];

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const cellKind = (night: NightStatus): CellKind => (isSplitNight(night) ? 'split' : night.state);

export interface NightGridProps {
  /** Each unit's nights, as a provider's availability check returns them. */
  units: readonly UnitAvailability[];
  /** The stay: one column per night, from `arrival` up to the night before `departure`. */
  arrival: string;
  departure: string;
  /** What a unit is called (`site`/`sites`, `cabin`/`cabins`). */
  unitNoun?: UnitNoun;
  /** ISO 4217 code for prices, from the provider's manifest. */
  currency?: string;
  /**
   * Who the nights come from (the provider's short name), for the lines that say it did not
   * report some: "ParkStay didn't say which nights are free; check on ParkStay".
   */
  source?: string;
  /** The table's caption. Default: "Availability by night, 6–8 Nov". */
  caption?: string;
  /** The summary line, so a page can move focus to it once a check completes. */
  summaryRef?: Ref<HTMLParagraphElement>;
  /** Shown above the summary, e.g. a release notice. */
  children?: ReactNode;
  /**
   * Whether "Fully available only" starts on (default). Turn it off when the nights that are
   * free matter even without a whole stay, such as a result that found only some nights.
   */
  fullyAvailableOnly?: boolean;
}

function NightCell({ kind, label, short }: { kind: CellKind; label: string; short?: string }) {
  const look = lookOf(kind);
  const Icon = look.icon;
  return (
    <td className="px-1 py-1.5 text-center">
      <span
        className={cx(
          'inline-flex h-9 min-w-[3rem] items-center justify-center gap-1 rounded-md px-1.5 text-xs font-semibold tabular-nums',
          look.cell
        )}
      >
        <Icon size={16} aria-hidden="true" className={cx('shrink-0', look.glyph)} />
        {short && <span aria-hidden="true">{short}</span>}
        <VisuallyHidden>{label}</VisuallyHidden>
      </span>
    </td>
  );
}

/**
 * Units by nights, for one stay: a real `<table>` with a caption, a column per night ("Fri 3";
 * never the check-out day), a row per unit, and every cell's state in words as well as an icon
 * (and its price when known). A summary line ("8 of 24 sites free for all 2 nights") and a
 * "Fully available only" switch (on by default) come first; the first 10 rows show, with
 * "Show all" for the rest. Only known nights count: a night not released yet, or one the
 * source did not report, is never read as taken, and the summary says so when that is all
 * there is. The table scrolls sideways inside its own region (a tab stop only while it
 * overflows) with the unit names held in place, so a 30-night stay stays readable.
 * Domain-generic: Explore's place page and watch details use it.
 */
export function NightGrid({
  units,
  arrival,
  departure,
  unitNoun = DEFAULT_UNIT_NOUN,
  currency,
  source = 'The provider',
  caption,
  summaryRef,
  children,
  fullyAvailableOnly = true,
}: NightGridProps) {
  const captionId = useId();
  const regionRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [fullyOnly, setFullyOnly] = useState(fullyAvailableOnly);
  const [showAll, setShowAll] = useState(false);
  const nights = useMemo(() => stayNights(arrival, departure), [arrival, departure]);
  const summary = useMemo(() => summariseAvailability(units, nights), [units, nights]);
  const rows = useMemo(
    () => (fullyOnly ? units.filter((unit) => isFullyAvailable(unit, nights)) : [...units]),
    [units, nights, fullyOnly]
  );
  const shown = showAll ? rows : rows.slice(0, NIGHT_GRID_ROWS);
  const present = useMemo(() => {
    const kinds = new Set<CellKind>();
    for (const unit of shown) for (const date of nights) kinds.add(cellKind(nightOf(unit, date)));
    return LEGEND_ORDER.filter((kind) => kinds.has(kind));
  }, [shown, nights]);
  const notes = units.length > 0 ? summaryNotes(summary, unitNoun, source) : [];

  // The table's region is a tab stop (to scroll it from the keyboard) only while it overflows.
  const hasTable = rows.length > 0;
  useLayoutEffect(() => {
    const region = regionRef.current;
    if (!region) return undefined;
    const measure = () => setOverflows(region.scrollWidth > region.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    if (region.firstElementChild) observer.observe(region.firstElementChild);
    return () => observer.disconnect();
  }, [hasTable, nights.length, shown.length]);

  return (
    <div className="flex flex-col gap-4">
      {children}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p ref={summaryRef} tabIndex={-1} className="text-base font-semibold text-fg">
          {units.length > 0
            ? summaryLine(summary, unitNoun, source)
            : `No ${unitNoun.many} were listed for these dates`}
        </p>
        {units.length > 0 && (
          <Switch
            label="Fully available only"
            checked={fullyOnly}
            onChange={(event) => setFullyOnly(event.target.checked)}
          />
        )}
      </div>

      {notes.map((note) => (
        <p key={note} className="-mt-2 text-sm text-fg-secondary">
          {note}
        </p>
      ))}

      {units.length > 0 && rows.length === 0 && noFullRowsMessage(summary, unitNoun) && (
        <p className="text-sm text-fg-secondary">{noFullRowsMessage(summary, unitNoun)}</p>
      )}

      {rows.length > 0 && (
        <>
          {present.length > 0 && (
            <ul
              aria-label="Key"
              className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-fg-secondary"
            >
              {present.map((kind) => {
                const look = lookOf(kind);
                const Icon = look.icon;
                return (
                  <li key={kind} className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={cx(
                        'inline-flex h-5 w-5 items-center justify-center rounded-sm',
                        look.cell
                      )}
                    >
                      <Icon size={14} className={look.glyph} />
                    </span>
                    {kind === 'split' ? splitNightLabel(unitNoun) : NIGHT_STATE_LABELS[kind]}
                  </li>
                );
              })}
            </ul>
          )}

          {/* `relative` makes it the containing block of the cells' visually hidden text, so
              that text scrolls (and is clipped) with the table instead of widening the page.
              Focusable while it overflows, so it can be scrolled sideways from the keyboard. */}
          <div
            ref={regionRef}
            role="region"
            aria-labelledby={captionId}
            tabIndex={overflows ? 0 : undefined}
            className="relative overflow-x-auto rounded-lg border border-border bg-surface"
          >
            <table className="w-full border-collapse text-sm">
              <caption id={captionId} className="sr-only">
                {caption ?? `Availability by night, ${stayRangeLabel(arrival, departure)}`}
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="sticky left-0 bg-surface-subtle px-3 py-2 text-left font-semibold text-fg-secondary"
                  >
                    {capitalise(unitNoun.one)}
                  </th>
                  {nights.map((date, i) => (
                    <th
                      key={date}
                      scope="col"
                      className="whitespace-nowrap bg-surface-subtle px-1 py-2 text-center text-xs font-semibold tabular-nums text-fg-secondary"
                    >
                      {nightHeading(date, nights[i - 1])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((unit) => (
                  <tr key={unit.unitId} className="border-b border-border last:border-b-0">
                    <th
                      scope="row"
                      className="sticky left-0 max-w-[12rem] bg-surface px-3 py-1.5 text-left font-semibold text-fg"
                    >
                      <span className="block truncate">{unit.unitName}</span>
                      {unit.unitType && (
                        <span className="block truncate text-xs font-normal text-fg-muted">
                          {unit.unitType}
                        </span>
                      )}
                    </th>
                    {nights.map((date) => {
                      const night = nightOf(unit, date);
                      return (
                        <NightCell
                          key={date}
                          kind={cellKind(night)}
                          {...nightCellText(night, currency, unitNoun)}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > NIGHT_GRID_ROWS && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              aria-expanded={showAll}
              onClick={() => setShowAll((all) => !all)}
            >
              {showAll ? `Show fewer ${unitNoun.many}` : `Show all ${rows.length} ${unitNoun.many}`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export default NightGrid;
