/**
 * Manual Booking Form Component
 * Form for manually adding a booking
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bookingSchema, BookingSchemaType } from '../../../shared/schemas/booking.schema';

interface ManualBookingFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}


const ManualBookingForm: React.FC<ManualBookingFormProps> = ({ onSuccess, onCancel }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<BookingSchemaType>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      bookingReference: '',
      parkName: '',
      campgroundName: '',
      siteNumber: '',
      siteType: '',
      arrivalDate: new Date(),
      departureDate: new Date(),
      numGuests: 2,
      totalCost: undefined,
      notes: '',
    },
  });

  const arrivalDate = watch('arrivalDate');
  const departureDate = watch('departureDate');

  const handleFormSubmit = async (data: BookingSchemaType) => {
    try {
      setIsSubmitting(true);
      setError('');

      const response = await window.api.booking.create(data);

      if (response.success) {
        onSuccess();
      } else {
        setError(response.error || 'Failed to create booking');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate number of nights
  const numNights =
    arrivalDate && departureDate
      ? Math.ceil(
          (new Date(departureDate).getTime() - new Date(arrivalDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-3 border border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Booking Reference */}
      <div>
        <label htmlFor="bookingReference" className="block text-sm font-medium text-gray-700 mb-1">
          Booking Reference *
        </label>
        <input
          id="bookingReference"
          type="text"
          {...register('bookingReference')}
          className="input"
          placeholder="e.g., ABC123XYZ"
          maxLength={50}
        />
        {errors.bookingReference && (
          <p className="mt-1 text-sm text-red-600">{errors.bookingReference.message}</p>
        )}
      </div>

      {/* Park Name */}
      <div>
        <label htmlFor="parkName" className="block text-sm font-medium text-gray-700 mb-1">
          Park Name *
        </label>
        <input
          id="parkName"
          type="text"
          {...register('parkName')}
          className="input"
          placeholder="e.g., Rottnest Island"
        />
        {errors.parkName && <p className="mt-1 text-sm text-red-600">{errors.parkName.message}</p>}
      </div>

      {/* Campground Name */}
      <div>
        <label htmlFor="campgroundName" className="block text-sm font-medium text-gray-700 mb-1">
          Campground Name *
        </label>
        <input
          id="campgroundName"
          type="text"
          {...register('campgroundName')}
          className="input"
          placeholder="e.g., Kingstown Barracks"
        />
        {errors.campgroundName && (
          <p className="mt-1 text-sm text-red-600">{errors.campgroundName.message}</p>
        )}
      </div>

      {/* Site Details */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="siteNumber" className="block text-sm font-medium text-gray-700 mb-1">
            Site Number (optional)
          </label>
          <input
            id="siteNumber"
            type="text"
            {...register('siteNumber')}
            className="input"
            placeholder="e.g., A12"
          />
          {errors.siteNumber && (
            <p className="mt-1 text-sm text-red-600">{errors.siteNumber.message}</p>
          )}
        </div>
        <div>
          <label htmlFor="siteType" className="block text-sm font-medium text-gray-700 mb-1">
            Site Type (optional)
          </label>
          <input
            id="siteType"
            type="text"
            {...register('siteType')}
            className="input"
            placeholder="e.g., Tent, Caravan"
          />
          {errors.siteType && (
            <p className="mt-1 text-sm text-red-600">{errors.siteType.message}</p>
          )}
        </div>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-4">
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

      {/* Duration Display */}
      {numNights > 0 && (
        <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
          Duration: {numNights} night{numNights !== 1 ? 's' : ''}
        </div>
      )}

      {/* Guests and Cost */}
      <div className="grid grid-cols-2 gap-4">
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
        <div>
          <label htmlFor="totalCost" className="block text-sm font-medium text-gray-700 mb-1">
            Total Cost (optional)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-2.5 text-gray-500">$</span>
            <input
              id="totalCost"
              type="number"
              min="0"
              step="0.01"
              {...register('totalCost', { valueAsNumber: true })}
              className="input pl-7"
              placeholder="0.00"
            />
          </div>
          {errors.totalCost && (
            <p className="mt-1 text-sm text-red-600">{errors.totalCost.message}</p>
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
          placeholder="Add any additional details..."
        />
        {errors.notes && <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>}
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
        <button type="submit" disabled={isSubmitting} className="btn-primary">
          {isSubmitting ? 'Adding...' : 'Add Booking'}
        </button>
      </div>
    </form>
  );
};

export default ManualBookingForm;
