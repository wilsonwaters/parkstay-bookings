import { useId, type ReactNode } from 'react';
import { Clock } from 'lucide-react';
import type { LocationDetail, UnitSummary } from '../../../shared/types/catalog.types';
import { amenityIcon } from '../../components/amenityIcons';
import { ExternalLink } from '../../components/ExternalLink';
import { unitCountLabel, unitNoun } from '../../components/locationFormat';
import { RichText } from '../../components/RichText';
import { Disclosure, Notice } from '../../components/ui';
import { guestRangeLabel, unitTypeBreakdown, type PlaceLinks } from './placeModel';

/** A titled part of the place page's main column. */
export function PlaceSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-xl font-semibold text-fg">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** "More information", with the host it goes to under it. */
export function MoreInformationLink({ info }: { info: { url: string; host: string } }) {
  return (
    <ExternalLink href={info.url} detail={info.host}>
      More information
    </ExternalLink>
  );
}

/** The link to read more on the provider's side: the info page, else its page, else its site. */
export function InfoLink({ links, shortName }: { links: PlaceLinks; shortName: string }) {
  if (links.info) return <MoreInformationLink info={links.info} />;
  if (links.view) return <ExternalLink href={links.view}>View on {shortName}</ExternalLink>;
  if (links.visit) return <ExternalLink href={links.visit}>Visit {shortName}</ExternalLink>;
  return null;
}

/**
 * About: the provider's description (sanitised by main), or its summary, or a plain sentence
 * that it has none, with the link to read more.
 */
export function AboutSection({
  detail,
  shortName,
  links,
}: {
  detail: Pick<LocationDetail, 'descriptionHtml' | 'summary'>;
  shortName: string;
  links: PlaceLinks;
}) {
  return (
    <PlaceSection title="About">
      {detail.descriptionHtml ? (
        <RichText html={detail.descriptionHtml} />
      ) : detail.summary ? (
        <p className="max-w-2xl text-base text-fg-secondary">{detail.summary}</p>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-base text-fg-secondary">
            {shortName} hasn&apos;t published a description.
          </p>
          <InfoLink links={links} shortName={shortName} />
        </div>
      )}
    </PlaceSection>
  );
}

/** Facilities: each with its icon and its name. */
export function FacilitiesSection({ amenities }: { amenities: readonly string[] }) {
  if (amenities.length === 0) return null;
  return (
    <PlaceSection title="Facilities">
      <ul role="list" className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {amenities.map((amenity) => {
          const Icon = amenityIcon(amenity);
          return (
            <li key={amenity} className="flex items-center gap-3 text-base text-fg">
              <Icon aria-hidden="true" className="shrink-0 text-fg-secondary" />
              {amenity}
            </li>
          );
        })}
      </ul>
    </PlaceSection>
  );
}

/**
 * Sites: how many, by type ("Tent site × 12"), how many guests they take, and every unit's
 * name behind "Show all {n} sites". Hidden when the provider lists no units.
 */
export function SitesSection({
  units,
  unitCount,
  kind,
}: {
  units: readonly UnitSummary[];
  /** The place's own count (the catalogue's), which can differ from the units listed. */
  unitCount?: number;
  kind: string;
}) {
  if (units.length === 0) return null;
  const noun = unitNoun(kind);
  const breakdown = unitTypeBreakdown(units);
  const guests = guestRangeLabel(units, noun);
  const title = noun.many.charAt(0).toUpperCase() + noun.many.slice(1);
  const count = unitCount && unitCount > 0 ? unitCount : units.length;
  // A provider can list kinds of unit rather than each one (ParkStay's "One site - select on
  // arrival" for 56 sites): then the list is of unit types, and says so.
  const byType = count !== units.length;
  const listed = byType
    ? units.length === 1
      ? `Show the ${noun.one} type`
      : `Show all ${units.length} ${noun.one} types`
    : units.length === 1
      ? `Show the ${noun.one}`
      : `Show all ${units.length} ${noun.many}`;
  return (
    <PlaceSection title={title}>
      <p className="text-base font-semibold text-fg">{unitCountLabel(kind, count)}</p>
      {byType && (
        <p className="mt-1 text-base text-fg-secondary">
          Bookable as {units.length} {noun.one} {units.length === 1 ? 'type' : 'types'}
        </p>
      )}
      {breakdown.some((group) => group.type !== null) && (
        <ul role="list" className="mt-2 flex flex-col gap-1 text-base text-fg-secondary">
          {breakdown.map((group) => (
            <li key={group.type ?? ''} className="tabular-nums">
              {group.type ?? 'Other'} × {group.count}
            </li>
          ))}
        </ul>
      )}
      {guests && <p className="mt-2 text-base text-fg-secondary">{guests}</p>}
      <Disclosure summary={listed} className="mt-4 max-w-2xl">
        <ul role="list" className="columns-2 gap-x-8 sm:columns-3">
          {units.map((unit) => (
            <li key={unit.unitId} className="break-inside-avoid py-0.5 text-fg">
              {unit.unitName}
            </li>
          ))}
        </ul>
      </Disclosure>
    </PlaceSection>
  );
}

/** Booking rules: the provider's release sentence, as calm information with a time cue. */
export function BookingRulesSection({ releaseInfo }: { releaseInfo?: string }) {
  if (!releaseInfo) return null;
  return (
    <PlaceSection title="Booking rules">
      <Notice tone="info" icon={Clock} className="max-w-2xl">
        {releaseInfo}
      </Notice>
    </PlaceSection>
  );
}
