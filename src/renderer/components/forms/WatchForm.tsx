/**
 * Watch Form Component
 * Shared form for creating and editing watches
 */

import { useForm } from 'react-hook-form';
import React, { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { watchSchema, WatchSchemaType } from '../../../shared/schemas/watch.schema';
import { Watch } from '../../../shared/types';

interface Campground {
  id: number;
  name: string;
  type: string;
  coordinates?: [number, number];
}

interface WatchFormProps {
  initialData?: Partial<Watch>;
  onSubmit: (data: WatchSchemaType) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const SITE_TYPES = [
  { value: 'tent', label: 'Tent Site' },
  { value: 'caravan', label: 'Caravan/RV Site' },
  { value: 'cabin', label: 'Cabin' },
  { value: 'hut', label: 'Hut' },
];

const CHECK_INTERVALS = [
  { value: 60, label: 'Every hour' },
  { value: 240, label: 'Every 4 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Once daily' },
];

const WatchForm: React.FC<WatchFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Create Watch',
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campgroundSearchQuery, setCampgroundSearchQuery] = useState('');
  const [allCampgrounds, setAllCampgrounds] = useState<Campground[]>([]);
  const [filteredCampgrounds, setFilteredCampgrounds] = useState<Campground[]>([]);
  const [isLoadingCampgrounds, setIsLoadingCampgrounds] = useState(false);
  const [campgroundError, setCampgroundError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<WatchSchemaType>({
    resolver: zodResolver(watchSchema),
    defaultValues: {
      name: initialData?.name || '',
      parkId: initialData?.parkId || '',
      parkName: initialData?.parkName || '',
      campgroundId: initialData?.campgroundId || '',
      campgroundName: initialData?.campgroundName || '',
      arrivalDate: initialData?.arrivalDate || new Date(),
      departureDate: initialData?.departureDate || new Date(),
      numGuests: initialData?.numGuests || 2,
      checkIntervalMinutes: initialData?.checkIntervalMinutes || 60,
      autoBook: initialData?.autoBook || false,
      notifyOnly: initialData?.notifyOnly !== undefined ? initialData.notifyOnly : true,
      maxPrice: initialData?.maxPrice,
      notes: initialData?.notes || '',
    },
  });

  const autoBook = watch('autoBook');
  const campgroundName = watch('campgroundName');

  // Load all campgrounds on mount
  useEffect(() => {
    loadCampgrounds();
  }, []);

  // Filter campgrounds when search query changes
  useEffect(() => {
    if (campgroundSearchQuery.length >= 2) {
      const filtered = allCampgrounds.filter((cg) =>
        cg.name.toLowerCase().includes(campgroundSearchQuery.toLowerCase())
      );
      setFilteredCampgrounds(filtered.slice(0, 10)); // Limit to 10 results
    } else {
      setFilteredCampgrounds([]);
    }
  }, [campgroundSearchQuery, allCampgrounds]);

  const loadCampgrounds = async () => {
    try {
      setIsLoadingCampgrounds(true);
      setCampgroundError(null);
      const response = await window.api.parkstay.getAllCampgrounds();
      if (response.success && response.data) {
        setAllCampgrounds(response.data);
      } else {
        setCampgroundError(response.error || 'Failed to load campgrounds');
      }
    } catch (error: any) {
      setCampgroundError(error.message || 'Failed to load campgrounds');
    } finally {
      setIsLoadingCampgrounds(false);
    }
  };

  const handleFormSubmit = async (data: WatchSchemaType) => {
    try {
      setIsSubmitting(true);
      await onSubmit(data);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCampgroundSelect = (campground: Campground) => {
    setValue('campgroundId', String(campground.id));
    setValue('campgroundName', campground.name);
    // Set park info to same as campground for now (ParkStay doesn't have separate park hierarchy)
    setValue('parkId', String(campground.id));
    setValue('parkName', campground.name);
    setCampgroundSearchQuery('');
    setFilteredCampgrounds([]);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Watch Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Watch Name *
        </label>
        <input
          id="name"
          type="text"
          {...register('name')}
          className="input"
          placeholder="e.g., Summer Holiday at Rottnest"
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      {/* Campground Search */}
      <div>
        <label htmlFor="campgroundSearch" className="block text-sm font-medium text-gray-700 mb-1">
          Select Campground *
        </label>
        {campgroundError && (
          <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
            {campgroundError}
            <button
              type="button"
              onClick={loadCampgrounds}
              className="ml-2 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
        <div className="relative">
          {campgroundName ? (
            <div className="flex items-center justify-between p-3 border border-gray-300 rounded-md bg-gray-50">
              <span className="text-gray-900">{campgroundName}</span>
              <button
                type="button"
                onClick={() => {
                  setValue('parkId', '');
                  setValue('parkName', '');
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
                placeholder={isLoadingCampgrounds ? 'Loading campgrounds...' : 'Type at least 2 characters to search...'}
                disabled={isLoadingCampgrounds}
              />
              {filteredCampgrounds.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                  {filteredCampgrounds.map((campground) => (
                    <button
                      key={campground.id}
                      type="button"
                      onClick={() => handleCampgroundSelect(campground)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="font-medium">{campground.name}</div>
                      <div className="text-sm text-gray-600">{campground.type}</div>
                    </button>
                  ))}
                </div>
              )}
              {campgroundSearchQuery.length >= 2 && filteredCampgrounds.length === 0 && !isLoadingCampgrounds && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-center text-gray-500">
                  No campgrounds found matching &quot;{campgroundSearchQuery}&quot;
                </div>
              )}
            </>
          )}
        </div>
        {errors.campgroundName && (
          <p className="mt-1 text-sm text-red-600">{errors.campgroundName.message}</p>
        )}
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="arrivalDate" className="block text-sm font-medium text-gray-700 mb-1">
            Check-in Date *
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
            Check-out Date *
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

      {/* Guests */}
      <div>
        <label htmlFor="numGuests" className="block text-sm font-medium text-gray-700 mb-1">
          Number of Guests *
        </label>
        <input
          id="numGuests"
          type="number"
          min="1"
          max="50"
          {...register('numGuests', { valueAsNumber: true })}
          className="input"
        />
        {errors.numGuests && (
          <p className="mt-1 text-sm text-red-600">{errors.numGuests.message}</p>
        )}
      </div>

      {/* Site Type Preferences */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Site Type Preferences
        </label>
        <div className="space-y-2">
          {SITE_TYPES.map((type) => (
            <label key={type.value} className="flex items-center">
              <input
                type="checkbox"
                value={type.value}
                {...register('siteType')}
                className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">{type.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Price Range */}
      <div>
        <label htmlFor="maxPrice" className="block text-sm font-medium text-gray-700 mb-1">
          Maximum Price per Night (optional)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-gray-500">$</span>
          <input
            id="maxPrice"
            type="number"
            min="0"
            step="0.01"
            {...register('maxPrice', { valueAsNumber: true })}
            className="input pl-7"
            placeholder="No limit"
          />
        </div>
        {errors.maxPrice && (
          <p className="mt-1 text-sm text-red-600">{errors.maxPrice.message}</p>
        )}
      </div>

      {/* Check Interval */}
      <div>
        <label htmlFor="checkIntervalMinutes" className="block text-sm font-medium text-gray-700 mb-1">
          Check Interval *
        </label>
        <select
          id="checkIntervalMinutes"
          {...register('checkIntervalMinutes', { valueAsNumber: true })}
          className="input"
        >
          {CHECK_INTERVALS.map((interval) => (
            <option key={interval.value} value={interval.value}>
              {interval.label}
            </option>
          ))}
        </select>
        {errors.checkIntervalMinutes && (
          <p className="mt-1 text-sm text-red-600">{errors.checkIntervalMinutes.message}</p>
        )}
      </div>

      {/* Auto-booking Toggle */}
      <div className="card bg-blue-50 border-blue-200">
        <div className="flex items-start">
          <input
            id="autoBook"
            type="checkbox"
            {...register('autoBook')}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
          />
          <div className="ml-3">
            <label htmlFor="autoBook" className="text-sm font-medium text-gray-900">
              Enable Auto-booking
            </label>
            <p className="text-sm text-gray-600 mt-1">
              Automatically book when availability is found (requires valid credentials)
            </p>
          </div>
        </div>
        {errors.autoBook && (
          <p className="mt-2 text-sm text-red-600">{errors.autoBook.message}</p>
        )}
      </div>

      {/* Notification Preferences */}
      {!autoBook && (
        <div className="card bg-green-50 border-green-200">
          <div className="flex items-start">
            <input
              id="notifyOnly"
              type="checkbox"
              {...register('notifyOnly')}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
            />
            <div className="ml-3">
              <label htmlFor="notifyOnly" className="text-sm font-medium text-gray-900">
                Send Notifications
              </label>
              <p className="text-sm text-gray-600 mt-1">
                Get notified when availability is found
              </p>
            </div>
          </div>
        </div>
      )}

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
          placeholder="Add any additional notes or preferences..."
        />
        {errors.notes && (
          <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>
        )}
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end space-x-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default WatchForm;
