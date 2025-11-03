/**
 * Dashboard Page
 * Shows overview of bookings, watches, and recent activity
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Booking } from '../../shared/types';
import { format } from 'date-fns';

const Dashboard: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    try {
      setIsLoading(true);
      const response = await window.api.booking.list();

      if (response.success && response.data) {
        setBookings(response.data);
      } else {
        setError(response.error || 'Failed to load bookings');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const upcomingBookings = bookings
    .filter((b) => new Date(b.arrivalDate) >= new Date() && b.status === 'confirmed')
    .sort((a, b) => new Date(a.arrivalDate).getTime() - new Date(b.arrivalDate).getTime())
    .slice(0, 5);

  const stats = {
    total: bookings.length,
    upcoming: bookings.filter(
      (b) => new Date(b.arrivalDate) >= new Date() && b.status === 'confirmed'
    ).length,
    past: bookings.filter((b) => new Date(b.departureDate) < new Date()).length,
    cancelled: bookings.filter((b) => b.status === 'cancelled').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">{error}</h3>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Message */}
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-900">Welcome to ParkStay Bookings</h2>
        <p className="mt-2 text-gray-600">
          Manage your WA Parks & Wildlife camping bookings in one place
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-4xl">📋</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Bookings</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-4xl">📅</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Upcoming</p>
              <p className="text-2xl font-bold text-primary-600">{stats.upcoming}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-4xl">✅</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Past</p>
              <p className="text-2xl font-bold text-gray-900">{stats.past}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-4xl">❌</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Cancelled</p>
              <p className="text-2xl font-bold text-red-600">{stats.cancelled}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming Bookings */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Upcoming Bookings</h3>
          <Link to="/bookings" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
            View All →
          </Link>
        </div>

        {upcomingBookings.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p className="text-lg">No upcoming bookings</p>
            <p className="text-sm mt-2">Add a booking to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingBookings.map((booking) => (
              <Link
                key={booking.id}
                to={`/bookings/${booking.id}`}
                className="block p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{booking.parkName}</h4>
                    <p className="text-sm text-gray-600">{booking.campgroundName}</p>
                    <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                      <span>
                        📅 {format(new Date(booking.arrivalDate), 'MMM d, yyyy')} -{' '}
                        {format(new Date(booking.departureDate), 'MMM d, yyyy')}
                      </span>
                      <span>🏕️ {booking.numNights} nights</span>
                      <span>👥 {booking.numGuests} guests</span>
                    </div>
                  </div>
                  {booking.siteNumber && (
                    <div className="ml-4 text-right">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800">
                        Site {booking.siteNumber}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/bookings"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-md transition-all"
          >
            <span className="text-3xl mr-3">➕</span>
            <div>
              <p className="font-medium text-gray-900">Add Booking</p>
              <p className="text-sm text-gray-500">Manually add a booking</p>
            </div>
          </Link>

          <Link
            to="/watches"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-md transition-all"
          >
            <span className="text-3xl mr-3">👁️</span>
            <div>
              <p className="font-medium text-gray-900">Create Watch</p>
              <p className="text-sm text-gray-500">Monitor availability</p>
            </div>
          </Link>

          <Link
            to="/settings"
            className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:shadow-md transition-all"
          >
            <span className="text-3xl mr-3">⚙️</span>
            <div>
              <p className="font-medium text-gray-900">Settings</p>
              <p className="text-sm text-gray-500">Configure the app</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
