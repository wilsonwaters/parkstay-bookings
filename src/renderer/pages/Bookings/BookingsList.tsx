/**
 * Bookings List Page
 * Displays all bookings with filtering and actions
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Booking } from '../../../shared/types';
import { format } from 'date-fns';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import ToastContainer, { useToast } from '../../components/Toast';
import ImportBookingForm from '../../components/forms/ImportBookingForm';
import ManualBookingForm from '../../components/forms/ManualBookingForm';
import ComingSoonBanner from '../../components/ComingSoonBanner';

const BookingsList: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'past' | 'cancelled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [, setAddMode] = useState<'import' | 'manual'>('import');
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: number | null }>({
    isOpen: false,
    id: null,
  });
  const { toasts, removeToast, success, error: showError } = useToast();

  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => {
    filterBookings();
  }, [bookings, filter, searchQuery]);

  const loadBookings = async () => {
    try {
      setIsLoading(true);
      setError('');
      const response = await window.api.booking.list();

      if (response.success && response.data) {
        setBookings(response.data);
      } else {
        setError(response.error || 'Failed to load bookings');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      showError('Failed to load bookings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBookingSuccess = async () => {
    success('Booking added successfully');
    setShowAddForm(false);
    setShowImportModal(false);
    await loadBookings();
  };

  const handleDeleteBooking = async () => {
    if (!deleteConfirm.id) return;

    try {
      const response = await window.api.booking.delete(deleteConfirm.id);

      if (response.success) {
        success('Booking deleted successfully');
        await loadBookings();
      } else {
        showError(response.error || 'Failed to delete booking');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while deleting booking');
    } finally {
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const filterBookings = () => {
    let filtered = [...bookings];
    const now = new Date();

    // Apply status filter
    switch (filter) {
      case 'upcoming':
        filtered = filtered.filter(
          (b) => new Date(b.arrivalDate) >= now && b.status === 'confirmed'
        );
        break;
      case 'past':
        filtered = filtered.filter((b) => new Date(b.departureDate) < now);
        break;
      case 'cancelled':
        filtered = filtered.filter((b) => b.status === 'cancelled');
        break;
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.parkName.toLowerCase().includes(query) ||
          b.campgroundName.toLowerCase().includes(query) ||
          b.bookingReference.toLowerCase().includes(query) ||
          b.siteNumber?.toLowerCase().includes(query)
      );
    }

    // Sort by arrival date (descending)
    filtered.sort((a, b) => new Date(b.arrivalDate).getTime() - new Date(a.arrivalDate).getTime());

    setFilteredBookings(filtered);
  };

  const getStatusBadge = (status: string) => {
    const classes = {
      confirmed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          classes[status as keyof typeof classes] || 'bg-gray-100 text-gray-800'
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (isLoading) {
    return <LoadingSpinner size="lg" text="Loading bookings..." fullScreen />;
  }

  return (
    <>
      <div className="space-y-6">
        {/* Coming Soon Banner */}
        <ComingSoonBanner featureName="Bookings" />

        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Your Bookings</h2>
            <p className="mt-1 text-sm text-gray-600">
              Manage your camping bookings ({filteredBookings.length} of {bookings.length})
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setAddMode('import');
                setShowImportModal(true);
              }}
              className="btn-secondary"
            >
              Import Booking
            </button>
            <button
              onClick={() => {
                setAddMode('manual');
                setShowAddForm(true);
              }}
              className="btn-primary"
            >
              + Add Booking
            </button>
          </div>
        </div>

      {/* Filters and Search */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Filter Tabs */}
          <div className="flex space-x-2">
            {[
              { key: 'all', label: 'All' },
              { key: 'upcoming', label: 'Upcoming' },
              { key: 'past', label: 'Past' },
              { key: 'cancelled', label: 'Cancelled' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key as any)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filter === tab.key
                    ? 'bg-primary-100 text-primary-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by park, campground, or reference..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full"
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
              <button
                onClick={loadBookings}
                className="mt-2 text-sm text-red-600 hover:text-red-500"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bookings List */}
      {filteredBookings.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-6xl mb-4">🏕️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings found</h3>
          <p className="text-gray-600 mb-4">
            {searchQuery
              ? 'Try adjusting your search or filters'
              : 'Get started by adding your first booking'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-primary"
            >
              Add Your First Booking
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredBookings.map((booking) => (
            <Link
              key={booking.id}
              to={`/bookings/${booking.id}`}
              className="card hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{booking.parkName}</h3>
                      <p className="text-sm text-gray-600">{booking.campgroundName}</p>
                    </div>
                    {getStatusBadge(booking.status)}
                  </div>

                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Check-in</p>
                      <p className="font-medium text-gray-900">
                        {format(new Date(booking.arrivalDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Check-out</p>
                      <p className="font-medium text-gray-900">
                        {format(new Date(booking.departureDate), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Duration</p>
                      <p className="font-medium text-gray-900">{booking.numNights} nights</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Guests</p>
                      <p className="font-medium text-gray-900">{booking.numGuests}</p>
                    </div>
                  </div>

                  {booking.siteNumber && (
                    <div className="mt-3">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800">
                        Site {booking.siteNumber}
                      </span>
                    </div>
                  )}

                  <div className="mt-3 text-xs text-gray-500">
                    Reference: {booking.bookingReference}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

        {/* Add Manual Booking Modal */}
        {showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Add Manual Booking</h3>
              <ManualBookingForm
                onSuccess={handleBookingSuccess}
                onCancel={() => setShowAddForm(false)}
              />
            </div>
          </div>
        )}

        {/* Import Booking Modal */}
        {showImportModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold mb-4">Import Booking</h3>
              <ImportBookingForm
                onSuccess={handleBookingSuccess}
                onCancel={() => setShowImportModal(false)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Booking"
        message="Are you sure you want to delete this booking? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDeleteBooking}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default BookingsList;
