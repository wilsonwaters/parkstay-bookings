import { useFormContext } from 'react-hook-form';
import type { ProviderManifest } from '../../../../../shared/types/provider.types';
import { LocationCombobox } from '../../../../components/LocationCombobox';
import { kindLabel, unitCountLabel } from '../../../../components/locationFormat';
import { Card } from '../../../../components/ui';
import { useSetWatchField } from '../../form/useSetWatchField';
import type { WatchFormValues } from '../../form/watchFormSchema';

/** Step 2: which of the provider's places. */
export function LocationStep({ manifest }: { manifest: ProviderManifest }) {
  const { watch, formState } = useFormContext<WatchFormValues>();
  const set = useSetWatchField();
  const location = watch('location');

  return (
    <>
      <LocationCombobox
        providerId={manifest.id}
        providerName={manifest.shortName}
        value={location}
        onChange={(next) => {
          set('location', next);
          set('unitIds', []);
        }}
        error={formState.errors.location?.message}
      />
      {location && (
        <Card padding="sm" className="flex flex-col gap-1">
          <p className="text-base font-semibold text-fg">{location.name}</p>
          <p className="text-sm text-fg-secondary">
            {[
              location.areaName,
              location.kind ? kindLabel(location.kind) : undefined,
              location.kind && location.unitCount
                ? unitCountLabel(location.kind, location.unitCount)
                : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </Card>
      )}
    </>
  );
}

export default LocationStep;
