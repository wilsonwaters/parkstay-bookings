/**
 * Site Sniper Form Component
 * Form for creating a Site Snipe: an automated attempt to book a high-demand
 * campsite at the earliest legal moment it becomes available.
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { siteSnipeSchema, SiteSnipeSchemaType } from '../../../shared/schemas/site-sniper.schema';
import { SiteSnipe, SnipeReleaseMode } from '../../../shared/types';

interface Campground {
  id: number;
  name: string;
  type?: string;
}

interface SiteSniperFormProps {
  initialData?: Partial<SiteSnipe>;
  onSubmit: (data: SiteSnipeSchemaType) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const SITE_TYPES = [
  { value: 'all', label: 'Any site type' },
  { value: 'tent', label: 'Tent' },
  { value: 'campervan', label: 'Campervan' },
  { value: 'caravan', label: 'Caravan' },
];

const RELEASE_MODES = [
  {
    value: SnipeReleaseMode.DAILY_ROLLOVER,
    label: 'Daily rollover (midnight AWST)',
    hint: 'A new arrival date (today + 180 days) opens every day at 00:00 AWST. No queue.',
  },
  {
    value: SnipeReleaseMode.SCHEDULED,
    label: 'Scheduled release (Ningaloo)',
    hint: 'A monthly block opens at a fixed instant (e.g. 10:00 AWST, first Tuesday). Gated by the DBCA queue.',
  },
  {
    value: SnipeReleaseMode.CANCELLATION,
    label: 'Cancellation watch',
    hint: 'No fixed release. Continuously poll for a target site to free up.',
  },
];

/**
 * Compute the next "first Tuesday of the month at 10:00 AWST" as a
 * datetime-local string (YYYY-MM-DDTHH:mm) expressed in AWST wall-clock time.
 * Used only to prefill the Scheduled-release default.
 */
function nextFirstTuesday1000AwstString(from: Date): string {
  const AWST_OFFSET_MS = 8 * 60 * 60 * 1000;
  // Shift so the UTC getters read AWST wall-clock components.
  const awstNow = new Date(from.getTime() + AWST_OFFSET_MS);
  let year = awstNow.getUTCFullYear();
  let month = awstNow.getUTCMonth();

  const buildFirstTuesday = (y: number, m: number): Date => {
    const firstOfMonth = new Date(Date.UTC(y, m, 1, 10, 0, 0));
    const dow = firstOfMonth.getUTCDay(); // 0 = Sun, 2 = Tue
    const offset = (2 - dow + 7) % 7;
    return new Date(Date.UTC(y, m, 1 + offset, 10, 0, 0));
  };

  let candidate = buildFirstTuesday(year, month);
  if (candidate.getTime() <= awstNow.getTime()) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = buildFirstTuesday(year, month);
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${candidate.getUTCFullYear()}-${pad(candidate.getUTCMonth() + 1)}-${pad(
    candidate.getUTCDate()
  )}T${pad(candidate.getUTCHours())}:${pad(candidate.getUTCMinutes())}`;
}

/**
 * Convert a datetime-local string (interpreted as AWST wall-clock) to the
 * corresponding UTC Date instant.
 */
function awstLocalStringToUtcDate(value: string): Date {
  return new Date(`${value}:00+08:00`);
}

const SiteSniperForm: React.FC<SiteSniperFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Create Snipe',
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campgroundSearchQuery, setCampgroundSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Campground[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [campgroundError, setCampgroundError] = useState<string | null>(null);
  const [siteIdsText, setSiteIdsText] = useState((initialData?.targetSiteIds || []).join(', '));
  const [releaseAtLocal, setReleaseAtLocal] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SiteSnipeSchemaType>({
    resolver: zodResolver(siteSnipeSchema) as any,
    defaultValues: {
      name: initialData?.name || '',
      campgroundId: initialData?.campgroundId || '',
      campgroundName: initialData?.campgroundName || '',
      targetSiteIds: initialData?.targetSiteIds || [],
      siteType: (initialData?.siteType as any) || 'all',
      arrivalDate: initialData?.arrivalDate || new Date(),
      departureDate: initialData?.departureDate || new Date(Date.now() + 24 * 60 * 60 * 1000),
      numAdult: initialData?.numAdult ?? 2,
      numConcession: initialData?.numConcession ?? 0,
      numChild: initialData?.numChild ?? 0,
      numInfant: initialData?.numInfant ?? 0,
      numVehicle: initialData?.numVehicle ?? 1,
      postcode: initialData?.postcode || undefined,
      releaseMode: initialData?.releaseMode || SnipeReleaseMode.DAILY_ROLLOVER,
      releaseAt: initialData?.releaseAt,
      queueEnabled: initialData?.queueEnabled ?? false,
      leadTimeSeconds: initialData?.leadTimeSeconds ?? 120,
      pollIntervalMs: initialData?.pollIntervalMs ?? 1500,
      windowDurationMs: initialData?.windowDurationMs ?? 900000,
      maxAttempts: initialData?.maxAttempts ?? 0,
      notes: initialData?.notes || '',
    },
  });

  const campgroundName = watch('campgroundName');
  const releaseMode = watch('releaseMode');

  // Search campgrounds when the query changes.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (campgroundSearchQuery.trim().length < 2) {
        setSearchResults([]);
        return;
      }
      try {
        setIsSearching(true);
        setCampgroundError(null);
        const response = await window.api.parkstay.searchCampgrounds(campgroundSearchQuery.trim());
        if (cancelled) return;
        if (response.success && response.data) {
          setSearchResults(response.data.slice(0, 10));
        } else {
          setCampgroundError(response.error || 'Failed to search campgrounds');
        }
      } catch (error: any) {
        if (!cancelled) setCampgroundError(error.message || 'Failed to search campgrounds');
      } finally {
        if (!cancelled) setIsSearching(false);
      }
    };
    const timer = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [campgroundSearchQuery]);

  // Prefill a sensible default release time when Scheduled is selected.
  useEffect(() => {
    if (releaseMode === SnipeReleaseMode.SCHEDULED && !releaseAtLocal) {
      const defaultLocal = nextFirstTuesday1000AwstString(new Date());
      setReleaseAtLocal(defaultLocal);
      setValue('releaseAt', awstLocalStringToUtcDate(defaultLocal));
      // Ningaloo scheduled releases are queue-gated — suggest enabling the queue.
      setValue('queueEnabled', true);
    }
  }, [releaseMode, releaseAtLocal, setValue]);

  const handleCampgroundSelect = (campground: Campground) => {
    setValue('campgroundId', String(campground.id));
    setValue('campgroundName', campground.name);
    setCampgroundSearchQuery('');
    setSearchResults([]);
  };

  const handleReleaseAtChange = (value: string) => {
    setReleaseAtLocal(value);
    if (value) {
      setValue('releaseAt', awstLocalStringToUtcDate(value));
    } else {
      setValue('releaseAt', undefined);
    }
  };

  const handleFormSubmit = async (data: SiteSnipeSchemaType) => {
    try {
      setIsSubmitting(true);
      const targetSiteIds = siteIdsText
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      await onSubmit({ ...data, targetSiteIds });
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Snipe Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Snipe Name *
        </label>
        <input
          id="name"
          type="text"
          {...register('name')}
          className="input"
          placeholder="e.g., Osprey Bay long weekend"
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
      </div>

      {/* Campground Search */}
      <div>
        <label htmlFor="campgroundSearch" className="block text-sm font-medium text-gray-700 mb-1">
          Select Campground *
        </label>
        {campgroundError && (
          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {campgroundError}
          </div>
        )}
        <div className="relative">
          {campgroundName ? (
            <div className="flex items-center justify-between p-3 border border-gray-300 rounded-md bg-gray-50">
              <span className="text-gray-900">{campgroundName}</span>
              <button
                type="button"
                onClick={() => {
                  setValue('campgroundId', '');
                  setValue('campgroundName', '');
                }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                id="campgroundSearch"
                type="text"
                value={campgroundSearchQuery}
                onChange={(e) => setCampgroundSearchQuery(e.target.value)}
                className="input"
                placeholder={
                  isSearching ? 'Searching...' : 'Type at least 2 characters to search...'
                }
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                  {searchResults.map((campground) => (
                    <button
                      key={campground.id}
                      type="button"
                      onClick={() => handleCampgroundSelect(campground)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium">{campground.name}</div>
                      {campground.type && (
                        <div className="text-sm text-gray-600">{campground.type}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {campgroundSearchQuery.trim().length >= 2 &&
                searchResults.length === 0 &&
                !isSearching && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-center text-gray-500">
                    No campgrounds found matching &quot;{campgroundSearchQuery}&quot;
                  </div>
                )}
            </>
          )}
        </div>
        {errors.campgroundId && (
          <p className="mt-1 text-sm text-red-600">{errors.campgroundId.message}</p>
        )}
      </div>

      {/* Preferred Site IDs */}
      <div>
        <label htmlFor="siteIds" className="block text-sm font-medium text-gray-700 mb-1">
          Preferred Site IDs (optional)
        </label>
        <input
          id="siteIds"
          type="text"
          value={siteIdsText}
          onChange={(e) => setSiteIdsText(e.target.value)}
          className="input"
          placeholder="e.g., 1024, 1025 — leave blank for any site"
        />
        <p className="mt-1 text-sm text-gray-500">
          Comma-separated site IDs to prefer. Leave blank to snipe any available site in the
          campground.
        </p>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="arrivalDate" className="block text-sm font-medium text-gray-700 mb-1">
            Arrival Date *
          </label>
          <input
            id="arrivalDate"
            type="date"
            {...register('arrivalDate', { valueAsDate: true })}
            className="input"
          />
          {errors.arrivalDate && (
            <p className="mt-1 text-sm text-red-600">{errors.arrivalDate.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="departureDate" className="block text-sm font-medium text-gray-700 mb-1">
            Departure Date *
          </label>
          <input
            id="departureDate"
            type="date"
            {...register('departureDate', { valueAsDate: true })}
            className="input"
          />
          {errors.departureDate && (
            <p className="mt-1 text-sm text-red-600">{errors.departureDate.message}</p>
          )}
        </div>
      </div>

      {/* Party Counts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div>
          <label htmlFor="numAdult" className="block text-sm font-medium text-gray-700 mb-1">
            Adults
          </label>
          <input
            id="numAdult"
            type="number"
            min="0"
            max="50"
            {...register('numAdult', { valueAsNumber: true })}
            className="input"
          />
          {errors.numAdult && (
            <p className="mt-1 text-sm text-red-600">{errors.numAdult.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="numConcession" className="block text-sm font-medium text-gray-700 mb-1">
            Concession
          </label>
          <input
            id="numConcession"
            type="number"
            min="0"
            max="50"
            {...register('numConcession', { valueAsNumber: true })}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="numChild" className="block text-sm font-medium text-gray-700 mb-1">
            Children
          </label>
          <input
            id="numChild"
            type="number"
            min="0"
            max="50"
            {...register('numChild', { valueAsNumber: true })}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="numInfant" className="block text-sm font-medium text-gray-700 mb-1">
            Infants
          </label>
          <input
            id="numInfant"
            type="number"
            min="0"
            max="50"
            {...register('numInfant', { valueAsNumber: true })}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="numVehicle" className="block text-sm font-medium text-gray-700 mb-1">
            Vehicles
          </label>
          <input
            id="numVehicle"
            type="number"
            min="0"
            max="10"
            {...register('numVehicle', { valueAsNumber: true })}
            className="input"
          />
        </div>
      </div>

      {/* Site Type + Postcode */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="siteType" className="block text-sm font-medium text-gray-700 mb-1">
            Site Type
          </label>
          <select id="siteType" {...register('siteType')} className="input">
            {SITE_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="postcode" className="block text-sm font-medium text-gray-700 mb-1">
            Postcode (optional)
          </label>
          <input
            id="postcode"
            type="text"
            {...register('postcode')}
            className="input"
            placeholder="e.g., 6000"
          />
          {errors.postcode && (
            <p className="mt-1 text-sm text-red-600">{errors.postcode.message}</p>
          )}
        </div>
      </div>

      {/* Release Mode */}
      <div>
        <label htmlFor="releaseMode" className="block text-sm font-medium text-gray-700 mb-1">
          Release Mode *
        </label>
        <select id="releaseMode" {...register('releaseMode')} className="input">
          {RELEASE_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-gray-500">
          {RELEASE_MODES.find((m) => m.value === releaseMode)?.hint}
        </p>
        {errors.releaseMode && (
          <p className="mt-1 text-sm text-red-600">{errors.releaseMode.message}</p>
        )}
      </div>

      {/* Scheduled release datetime */}
      {releaseMode === SnipeReleaseMode.SCHEDULED && (
        <div>
          <label htmlFor="releaseAt" className="block text-sm font-medium text-gray-700 mb-1">
            Release Date &amp; Time (AWST) *
          </label>
          <input
            id="releaseAt"
            type="datetime-local"
            value={releaseAtLocal}
            onChange={(e) => handleReleaseAtChange(e.target.value)}
            className="input"
          />
          <p className="mt-1 text-sm text-gray-500">
            Entered in Australian Western Standard Time (UTC+8). Defaults to the next first Tuesday
            at 10:00 AWST.
          </p>
          {errors.releaseAt && (
            <p className="mt-1 text-sm text-red-600">{errors.releaseAt.message}</p>
          )}
        </div>
      )}

      {/* Queue toggle */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start">
          <input
            id="queueEnabled"
            type="checkbox"
            {...register('queueEnabled')}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
          />
          <div className="ml-3">
            <label htmlFor="queueEnabled" className="text-sm font-medium text-gray-900">
              Establish DBCA queue session
            </label>
            <p className="text-sm text-gray-600 mt-1">
              Required for queue-gated releases such as Ningaloo Coast. A legitimate queue session
              is established at/after the release instant.
            </p>
          </div>
        </div>
      </div>

      {/* Timing controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="leadTimeSeconds" className="block text-sm font-medium text-gray-700 mb-1">
            Lead Time (seconds)
          </label>
          <input
            id="leadTimeSeconds"
            type="number"
            min="0"
            max="3600"
            {...register('leadTimeSeconds', { valueAsNumber: true })}
            className="input"
          />
          <p className="mt-1 text-sm text-gray-500">Start warming up this long before release.</p>
          {errors.leadTimeSeconds && (
            <p className="mt-1 text-sm text-red-600">{errors.leadTimeSeconds.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="pollIntervalMs" className="block text-sm font-medium text-gray-700 mb-1">
            Poll Interval (ms)
          </label>
          <input
            id="pollIntervalMs"
            type="number"
            min="500"
            max="60000"
            {...register('pollIntervalMs', { valueAsNumber: true })}
            className="input"
          />
          <p className="mt-1 text-sm text-gray-500">How often to check during the snipe window.</p>
          {errors.pollIntervalMs && (
            <p className="mt-1 text-sm text-red-600">{errors.pollIntervalMs.message}</p>
          )}
        </div>
        <div>
          <label
            htmlFor="windowDurationMinutes"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Snipe Window (minutes)
          </label>
          <input
            id="windowDurationMinutes"
            type="number"
            min="1"
            max="120"
            defaultValue={Math.round((initialData?.windowDurationMs ?? 900000) / 60000)}
            onChange={(e) => {
              const minutes = Number(e.target.value);
              if (!Number.isNaN(minutes)) {
                setValue('windowDurationMs', Math.round(minutes * 60000));
              }
            }}
            className="input"
          />
          <p className="mt-1 text-sm text-gray-500">
            Keep sniping for this long after release before giving up.
          </p>
          {errors.windowDurationMs && (
            <p className="mt-1 text-sm text-red-600">{errors.windowDurationMs.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="maxAttempts" className="block text-sm font-medium text-gray-700 mb-1">
            Max Attempts (0 = unlimited)
          </label>
          <input
            id="maxAttempts"
            type="number"
            min="0"
            {...register('maxAttempts', { valueAsNumber: true })}
            className="input"
          />
          {errors.maxAttempts && (
            <p className="mt-1 text-sm text-red-600">{errors.maxAttempts.message}</p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          rows={3}
          {...register('notes')}
          className="input"
          placeholder="Add any additional notes..."
        />
        {errors.notes && <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>}
      </div>

      {/* Compliance note */}
      <div className="card bg-yellow-50 border-yellow-200">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-2xl">⚠️</span>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-medium text-yellow-900">Please book responsibly</h4>
            <p className="mt-1 text-sm text-yellow-700">
              Use one DBCA account per person, book only one site per night, and only for a stay you
              genuinely intend to take (identity is verified on arrival). Site Sniper stops at
              placing a 30-minute temporary hold — you complete payment yourself within the hold
              window.
            </p>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end space-x-3 pt-4 border-t">
        <button type="button" onClick={onCancel} disabled={isSubmitting} className="btn-secondary">
          Cancel
        </button>
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default SiteSniperForm;
