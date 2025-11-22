/**
 * Watch Form Component
 * Shared form for creating and editing watches
 */

import { useForm } from 'react-hook-form';
import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { watchSchema, WatchSchemaType } from '../../../shared/schemas/watch.schema';
import { Watch } from '../../../shared/types';

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
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '60 minutes' },
];

const WatchForm: React.FC<WatchFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Create Watch',
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [campgroundSearchQuery, setCampgroundSearchQuery] = useState('');
  const [showCampgroundSearch, setShowCampgroundSearch] = useState(false);

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
      checkIntervalMinutes: initialData?.checkIntervalMinutes || 5,
      autoBook: initialData?.autoBook || false,
      notifyOnly: initialData?.notifyOnly !== undefined ? initialData.notifyOnly : true,
      maxPrice: initialData?.maxPrice,
      notes: initialData?.notes || '',
    },
  });

  const autoBook = watch('autoBook');
  const parkName = watch('parkName');
  const campgroundName = watch('campgroundName');

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

  // Mock campground search - in real app this would call API
  const handleParkSelect = (parkId: string, parkName: string) => {
    setValue('parkId', parkId);
    setValue('parkName', parkName);
    setSearchQuery('');
    setShowCampgroundSearch(true);
  };

  const handleCampgroundSelect = (campgroundId: string, campgroundName: string) => {
    setValue('campgroundId', campgroundId);
    setValue('campgroundName', campgroundName);
    setCampgroundSearchQuery('');
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

      {/* Park Search */}
      <div>
        <label htmlFor="parkSearch" className="block text-sm font-medium text-gray-700 mb-1">
          Select Park *
        </label>
        <div className="relative">
          {parkName ? (
            <div className="flex items-center justify-between p-3 border border-gray-300 rounded-md bg-gray-50">
              <span className="text-gray-900">{parkName}</span>
              <button
                type="button"
                onClick={() => {
                  setValue('parkId', '');
                  setValue('parkName', '');
                  setValue('campgroundId', '');
                  setValue('campgroundName', '');
                  setShowCampgroundSearch(false);
                }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                id="parkSearch"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="input"
                placeholder="Search for a park..."
              />
              {searchQuery && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                  <button
                    type="button"
                    onClick={() => handleParkSelect('park-1', 'Rottnest Island')}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="font-medium">Rottnest Island</div>
                    <div className="text-sm text-gray-600">Popular island destination</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleParkSelect('park-2', 'Karijini National Park')}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="font-medium">Karijini National Park</div>
                    <div className="text-sm text-gray-600">Outback gorges and pools</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleParkSelect('park-3', 'Cape Range National Park')}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50"
                  >
                    <div className="font-medium">Cape Range National Park</div>
                    <div className="text-sm text-gray-600">Coastal camping near Exmouth</div>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
        {errors.parkName && (
          <p className="mt-1 text-sm text-red-600">{errors.parkName.message}</p>
        )}
      </div>

      {/* Campground Search */}
      {showCampgroundSearch && (
        <div>
          <label htmlFor="campgroundSearch" className="block text-sm font-medium text-gray-700 mb-1">
            Select Campground *
          </label>
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
                  placeholder="Search for a campground..."
                />
                {campgroundSearchQuery && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    <button
                      type="button"
                      onClick={() => handleCampgroundSelect('cg-1', 'Kingstown Barracks')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50"
                    >
                      <div className="font-medium">Kingstown Barracks</div>
                      <div className="text-sm text-gray-600">Tent and caravan sites</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCampgroundSelect('cg-2', 'Main Campground')}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50"
                    >
                      <div className="font-medium">Main Campground</div>
                      <div className="text-sm text-gray-600">Large family campground</div>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          {errors.campgroundName && (
            <p className="mt-1 text-sm text-red-600">{errors.campgroundName.message}</p>
          )}
        </div>
      )}

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
