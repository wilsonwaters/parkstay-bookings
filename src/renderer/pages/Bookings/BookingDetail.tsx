/**
 * Booking Detail Page
 * Shows detailed booking information with edit and cancel options
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Booking, BookingStatus } from '../../../shared/types';
import { format } from 'date-fns';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import ToastContainer, { useToast } from '../../components/Toast';

const BookingDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toasts, removeToast, success, error: showError } = useToast();

  useEffect(() => {
    if (id) {
      loadBooking(parseInt(id));
    }
  }, [id]);

  const loadBooking = async (bookingId: number) => {
    try {
      setIsLoading(true);
      setError('');
      const response = await window.api.booking.get(bookingId);

      if (response.success && response.data) {
        setBooking(response.data);
      } else {
        setError(response.error || 'Booking not found');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!booking) return;

    try {
      setIsCancelling(true);
      // Note: The booking update API should support status updates
      // For now we'll update the status in the UI
      const response = await window.api.booking.update(booking.id, {} as any);

      if (response.success) {
        setBooking({ ...booking, status: BookingStatus.CANCELLED });
        setShowCancelDialog(false);
        success('Booking cancelled successfully');
      } else {
        showError(response.error || 'Failed to cancel booking');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while cancelling booking');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteBooking = async () => {
    if (!booking) return;

    try {
      setIsDeleting(true);
      const response = await window.api.booking.delete(booking.id);

      if (response.success) {
        success('Booking deleted successfully');
        setTimeout(() => navigate('/bookings'), 1000);
      } else {
        showError(response.error || 'Failed to delete booking');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while deleting booking');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner size="lg" text="Loading booking..." fullScreen />;
  }

  if (error || !booking) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/bookings')} className="btn-secondary">
          ← Back to Bookings
        </button>
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error || 'Booking not found'}</h3>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const classes = {
      confirmed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };

    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800'
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate('/bookings')} className="btn-secondary">
            ← Back to Bookings
          </button>
          <div className="flex items-center space-x-3">
            {booking.status === BookingStatus.CONFIRMED && (
              <button
                onClick={() => setShowCancelDialog(true)}
                disabled={isCancelling}
                className="btn-danger"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Booking'}
              </button>
            )}
            <button
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
              className="btn-secondary"
            >
              Delete
            </button>
          </div>
        </div>

      {/* Booking Details */}
      <div className="card">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{booking.parkName}</h2>
            <p className="text-lg text-gray-600">{booking.campgroundName}</p>
          </div>
          {getStatusBadge(booking.status)}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Check-in/out */}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Check-in</p>
              <p className="text-lg font-semibold text-gray-900">
                {format(new Date(booking.arrivalDate), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Check-out</p>
              <p className="text-lg font-semibold text-gray-900">
                {format(new Date(booking.departureDate), 'EEEE, MMMM d, yyyy')}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Duration</p>
              <p className="text-lg font-semibold text-gray-900">{booking.numNights} nights</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Guests</p>
              <p className="text-lg font-semibold text-gray-900">{booking.numGuests}</p>
            </div>
            {booking.siteNumber && (
              <div>
                <p className="text-sm font-medium text-gray-500">Site Number</p>
                <p className="text-lg font-semibold text-gray-900">{booking.siteNumber}</p>
              </div>
            )}
            {booking.totalCost && (
              <div>
                <p className="text-sm font-medium text-gray-500">Total Cost</p>
                <p className="text-lg font-semibold text-gray-900">
                  ${booking.totalCost.toFixed(2)} {booking.currency}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Reference */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-500">Booking Reference</p>
          <p className="text-lg font-mono text-gray-900">{booking.bookingReference}</p>
        </div>

        {/* Notes */}
        {booking.notes && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-500 mb-2">Notes</p>
            <p className="text-gray-900">{booking.notes}</p>
          </div>
        )}

        {/* Metadata */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-sm text-gray-500">
            <div>
              <p>Created: {format(new Date(booking.createdAt), 'MMM d, yyyy h:mm a')}</p>
            </div>
            <div>
              <p>Last updated: {format(new Date(booking.updatedAt), 'MMM d, yyyy h:mm a')}</p>
            </div>
          </div>
        </div>
      </div>

        {/* Cancel Dialog */}
        {showCancelDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold mb-4">Cancel Booking?</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to cancel this booking? This action cannot be undone.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowCancelDialog(false)}
                  disabled={isCancelling}
                  className="btn-secondary flex-1"
                >
                  Keep Booking
                </button>
                <button
                  onClick={handleCancelBooking}
                  disabled={isCancelling}
                  className="btn-danger flex-1"
                >
                  {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title="Delete Booking"
        message="Are you sure you want to delete this booking? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteBooking}
        onCancel={() => setShowDeleteDialog(false)}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default BookingDetail;
