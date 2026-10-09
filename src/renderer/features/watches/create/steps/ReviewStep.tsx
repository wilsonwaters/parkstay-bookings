import type { ReactNode } from 'react';
import { useFormContext } from 'react-hook-form';
import type { ProviderManifest } from '../../../../../shared/types/provider.types';
import {
  stayNightsLabel,
  partyLabel,
  stayDatesLabel,
} from '../../../../components/stay/stayFormat';
import type { UnitNoun } from '../../../../components/stay/UnitPicker';
import {
  Button,
  Field,
  Notice,
  ProviderBadge,
  TextField,
  Textarea,
} from '../../../../components/ui';
import {
  intervalLabel,
  parsePrice,
  watchStayFields,
  type WatchFormValues,
} from '../../form/watchFormSchema';

export type FlowStepId = 'provider' | 'location' | 'stay' | 'alerts' | 'review';

export interface ReviewStepProps {
  manifest: ProviderManifest;
  today: string;
  noun: UnitNoun;
  onChangeStep: (step: FlowStepId) => void;
  /** Why the last attempt to create the watch failed. */
  submitError?: string;
}

function Row({
  label,
  children,
  onChange,
}: {
  label: string;
  children: ReactNode;
  onChange: () => void;
}) {
  return (
    <div className="border-b border-border py-3 last:border-0">
      <dt className="text-sm text-fg-secondary">{label}</dt>
      <dd className="flex items-start justify-between gap-4 text-base text-fg">
        <span className="min-w-0">{children}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onChange}
          aria-label={`Change ${label.toLowerCase()}`}
          className="shrink-0"
        >
          Change
        </Button>
      </dd>
    </div>
  );
}

/** Step 5: everything chosen, each with a way back to change it, then the name and notes. */
export function ReviewStep({ manifest, today, noun, onChangeStep, submitError }: ReviewStepProps) {
  const { register, getValues, formState } = useFormContext<WatchFormValues>();
  const v = getValues();
  const fields = watchStayFields(manifest);
  const shownFields = v.autoHold ? [...fields.watch, ...fields.hold] : fields.watch;
  const price = parsePrice(v.maxPrice);
  const alerts = [
    v.allowPartialMatch
      ? 'Also when only some nights are free'
      : 'Only when the whole stay is free',
    v.notifyOnly ? 'stops after the first alert' : 'keeps checking after alerts',
  ].join(', ');

  return (
    <>
      <dl className="flex flex-col">
        <Row label="Provider" onChange={() => onChangeStep('provider')}>
          <span className="flex items-center gap-2">
            <ProviderBadge providerId={manifest.id} info={manifest} size="sm" />
          </span>
        </Row>
        <Row label="Location" onChange={() => onChangeStep('location')}>
          {[v.location?.name, v.location?.areaName].filter(Boolean).join(' · ')}
        </Row>
        <Row label="Dates" onChange={() => onChangeStep('stay')}>
          {v.arrival && v.departure
            ? `${stayDatesLabel(v.arrival, v.departure, today)} · ${stayNightsLabel(v.arrival, v.departure)}`
            : 'Not chosen'}
        </Row>
        <Row label="Guests" onChange={() => onChangeStep('stay')}>
          {partyLabel(v)}
        </Row>
        {shownFields.map((field) => {
          const value = v.stayParams[field.key];
          const shown =
            field.options?.find((o) => o.value === value)?.label ??
            (typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value || 'Not given');
          return (
            <Row
              key={field.key}
              label={field.label}
              onChange={() => onChangeStep(fields.watch.includes(field) ? 'stay' : 'alerts')}
            >
              {String(shown)}
            </Row>
          );
        })}
        <Row label={`Preferred ${noun.many}`} onChange={() => onChangeStep('stay')}>
          {v.unitIds.length ? `${v.unitIds.length} chosen` : `Any ${noun.one}`}
        </Row>
        <Row label="Max price per night" onChange={() => onChangeStep('stay')}>
          {price !== undefined ? `$${price}` : 'No limit'}
        </Row>
        <Row label="Checks" onChange={() => onChangeStep('alerts')}>
          {intervalLabel(v.checkIntervalMinutes)}
        </Row>
        <Row label="Alerts" onChange={() => onChangeStep('alerts')}>
          {alerts}
        </Row>
        {manifest.capabilities.holds && (
          <Row label="Automatic hold" onChange={() => onChangeStep('alerts')}>
            {v.autoHold ? `Hold a ${noun.one} when found` : 'Off'}
          </Row>
        )}
      </dl>
      <Field
        label="Name"
        hint="Shown in your list and alerts."
        error={formState.errors.name?.message}
      >
        <TextField autoComplete="off" {...register('name')} />
      </Field>
      <Field label="Notes" optional error={formState.errors.notes?.message}>
        <Textarea rows={3} {...register('notes')} />
      </Field>
      {submitError && (
        <Notice tone="danger" title="The watch couldn't be created">
          {submitError}
        </Notice>
      )}
    </>
  );
}

export default ReviewStep;
