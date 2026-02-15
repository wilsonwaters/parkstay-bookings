/**
 * Beat the Crowd Form Component
 * Form for creating advance-booking entries
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { stqSchema, STQSchemaType } from '../../../shared/schemas/stq.schema';
import { SkipTheQueueEntry, Booking } from '../../../shared/types';

interface STQFormProps {
  initialData?: Partial<SkipTheQueueEntry>;
  onSubmit: (data: STQSchemaType) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const CHECK_INTERVALS = [
  { value: 1, label: '1 minute' },
  { value: 2, label: '2 minutes' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
];

const STQForm: React.FC<STQFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  submitLabel = 'Create STQ Entry',
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<STQSchemaType>({
    resolver: zodResolver(stqSchema),
    defaultValues: {
      bookingId: initialData?.bookingId || 0,
      bookingReference: initialData?.bookingReference || '',
      checkIntervalMinutes: initialData?.checkIntervalMinutes || 2,
      maxAttempts: initialData?.maxAttempts || 100,
      notes: initialData?.notes || '',
    },
  });

  const bookingId = watch('bookingId');

  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => {
    if (bookingId) {
      const booking = bookings.find((b) => b.id === bookingId);
      if (booking) {
        setSelectedBooking(booking);
        setValue('bookingReference', booking.bookingReference);
      }
    }
  }, [bookingId, bookings, setValue]);

  const loadBookings = async () => {
    try {
      setIsLoadingBookings(true);
      const response = await window.api.booking.list();

      if (response.success && response.data) {
        // Filter to only show confirmed bookings that are upcoming
        const eligibleBookings = response.data.filter(
          (b) => b.status === 'confirmed' && new Date(b.arrivalDate) >= new Date()
        );
        setBookings(eligibleBookings);
      }
    } catch (err) {
      console.error('Error loading bookings:', err);
    } finally {
      setIsLoadingBookings(false);
    }
  };

  const handleFormSubmit = async (data: STQSchemaType) => {
    try {
      setIsSubmitting(true);
      await onSubmit(data);
    } catch (error) {
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Booking Selection */}
      <div>
        <label htmlFor="bookingId" className="block text-sm font-medium text-gray-700 mb-1">
          Select Booking *
        </label>
        {isLoadingBookings ? (
          <div className="input flex items-center justify-center text-gray-500">
            Loading bookings...
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
            <p className="text-sm text-yellow-800">
              No eligible bookings found. You need a confirmed upcoming booking to use Beat the Crowd.
            </p>
          </div>
        ) : (
          <>
            <select
              id="bookingId"
              {...register('bookingId', { valueAsNumber: true })}
              className="input"
              disabled={!!initialData?.bookingId}
            >
              <option value="">Select a booking...</option>
              {bookings.map((booking) => (
                <option key={booking.id} value={booking.id}>
                  {booking.parkName} - {booking.campgroundName} (
                  {new Date(booking.arrivalDate).toLocaleDateString()})
                </option>
              ))}
            </select>
            {initialData?.bookingId && (
              <p className="mt-1 text-sm text-gray-500">
                Cannot change booking for existing STQ entry
              </p>
            )}
          </>
        )}
        {errors.bookingId && (
          <p className="mt-1 text-sm text-red-600">{errors.bookingId.message}</p>
        )}
      </div>

      {/* Booking Reference (read-only) */}
      {selectedBooking && (
        <div>
          <label htmlFor="bookingReference" className="block text-sm font-medium text-gray-700 mb-1">
            Booking Reference *
          </label>
          <input
            id="bookingReference"
            type="text"
            {...register('bookingReference')}
            className="input bg-gray-50"
            readOnly
          />
          <p className="mt-1 text-sm text-gray-500">
            Reference number will be used to track and rebook this reservation
          </p>
          {errors.bookingReference && (
            <p className="mt-1 text-sm text-red-600">{errors.bookingReference.message}</p>
          )}
        </div>
      )}

      {/* Booking Details Card */}
      {selectedBooking && (
        <div className="card bg-blue-50 border-blue-200">
          <h4 className="text-sm font-medium text-blue-900 mb-3">Booking Details</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-blue-700 font-medium">Park</p>
              <p className="text-blue-900">{selectedBooking.parkName}</p>
            </div>
            <div>
              <p className="text-blue-700 font-medium">Campground</p>
              <p className="text-blue-900">{selectedBooking.campgroundName}</p>
            </div>
            <div>
              <p className="text-blue-700 font-medium">Check-in</p>
              <p className="text-blue-900">
                {new Date(selectedBooking.arrivalDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-blue-700 font-medium">Check-out</p>
              <p className="text-blue-900">
                {new Date(selectedBooking.departureDate).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}

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
        <p className="mt-1 text-sm text-gray-500">
          How often to check if new dates are available for rebooking
        </p>
        {errors.checkIntervalMinutes && (
          <p className="mt-1 text-sm text-red-600">{errors.checkIntervalMinutes.message}</p>
        )}
      </div>

      {/* Max Attempts */}
      <div>
        <label htmlFor="maxAttempts" className="block text-sm font-medium text-gray-700 mb-1">
          Maximum Attempts *
        </label>
        <input
          id="maxAttempts"
          type="number"
          min="1"
          max="10000"
          {...register('maxAttempts', { valueAsNumber: true })}
          className="input"
        />
        <p className="mt-1 text-sm text-gray-500">
          Stop checking after this many attempts (default: 100)
        </p>
        {errors.maxAttempts && (
          <p className="mt-1 text-sm text-red-600">{errors.maxAttempts.message}</p>
        )}
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
        {errors.notes && (
          <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>
        )}
      </div>

      {/* Info Box */}
      <div className="card bg-green-50 border-green-200">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-2xl">ℹ️</span>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-medium text-green-900">About Beat the Crowd</h4>
            <p className="mt-1 text-sm text-green-700">
              Beat the Crowd helps you manage bookings in advance of ParkStay's 180-day booking
              limit by automatically cancelling and rebooking your reservation as the window
              advances — letting you secure popular campsites well before others can book them. This feature requires
              valid ParkStay credentials.
            </p>
          </div>
        </div>
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
          disabled={isSubmitting || bookings.length === 0}
          className="btn-primary"
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
};

export default STQForm;
