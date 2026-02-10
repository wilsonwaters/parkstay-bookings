/**
 * Watch Detail Page
 * Shows watch information and availability results
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Watch, WatchExecutionResult } from '../../../shared/types/watch.types';
import { AvailabilityCheckResult } from '../../../shared/types/api.types';
import AvailabilityGrid from '../../components/AvailabilityGrid';

const WatchDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [watch, setWatch] = useState<Watch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<WatchExecutionResult | null>(null);
  const [availabilityData, setAvailabilityData] = useState<AvailabilityCheckResult | null>(null);

  // Load watch data
  const loadWatch = useCallback(async () => {
    if (!id) return;

    try {
      setIsLoading(true);
      setError(null);
      const response = await window.api.watch.get(parseInt(id, 10));

      if (response.success && response.data) {
        setWatch(response.data);
      } else {
        setError(response.error || 'Failed to load watch');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadWatch();
  }, [loadWatch]);

  // Auto-refresh watch data every 30 seconds to show updated availability
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isChecking) {
        loadWatch();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [loadWatch, isChecking]);

  // Check availability now
  const handleCheckNow = async () => {
    if (!watch) return;

    try {
      setIsChecking(true);
      setError(null);

      // Execute the watch to get availability
      const response = await window.api.watch.execute(watch.id);

      if (response.success && response.data) {
        setExecutionResult(response.data);
        // Reload watch to get updated lastCheckedAt
        loadWatch();
      } else {
        setError(response.error || 'Failed to check availability');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while checking availability');
    } finally {
      setIsChecking(false);
    }
  };

  // Direct availability check (more detailed)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDetailedCheck = async () => {
    if (!watch) return;

    try {
      setIsChecking(true);
      setError(null);

      const response = await window.api.parkstay.checkAvailability(watch.campgroundId, {
        arrivalDate: watch.arrivalDate.toString(),
        departureDate: watch.departureDate.toString(),
        numGuests: watch.numGuests,
        siteType: watch.siteType,
      });

      if (response.success && response.data) {
        setAvailabilityData(response.data);
        // Reload watch to update timestamp
        loadWatch();
      } else {
        setError(response.error || 'Failed to check availability');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while checking availability');
    } finally {
      setIsChecking(false);
    }
  };

  // Toggle watch active status
  const handleToggleActive = async () => {
    if (!watch) return;

    try {
      if (watch.isActive) {
        await window.api.watch.deactivate(watch.id);
      } else {
        await window.api.watch.activate(watch.id);
      }
      loadWatch();
    } catch (err: any) {
      setError(err.message || 'Failed to update watch status');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!watch) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900">Watch not found</h2>
        <button onClick={() => navigate('/watches')} className="mt-4 btn-primary">
          Back to Watches
        </button>
      </div>
    );
  }

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return format(d, 'EEE, d MMM yyyy');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/watches')}
            className="text-primary-600 hover:text-primary-700 text-sm font-medium mb-2"
          >
            &larr; Back to Watches
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{watch.name}</h1>
          <p className="mt-1 text-gray-600">{watch.campgroundName}</p>
        </div>
        <div className="flex items-center space-x-3">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              watch.isActive
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {watch.isActive ? 'Active' : 'Inactive'}
          </span>
          <button onClick={handleToggleActive} className="btn-secondary">
            {watch.isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={() => navigate(`/watches/${watch.id}/edit`)}
            className="btn-secondary"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <div className="flex">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Watch Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Dates Card */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Trip Dates
          </h3>
          <div className="space-y-2">
            <div>
              <span className="text-sm text-gray-500">Check-in:</span>
              <p className="font-medium text-gray-900">{formatDate(watch.arrivalDate)}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Check-out:</span>
              <p className="font-medium text-gray-900">{formatDate(watch.departureDate)}</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Guests:</span>
              <p className="font-medium text-gray-900">{watch.numGuests}</p>
            </div>
          </div>
        </div>

        {/* Settings Card */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Watch Settings
          </h3>
          <div className="space-y-2">
            <div>
              <span className="text-sm text-gray-500">Check Interval:</span>
              <p className="font-medium text-gray-900">Every {watch.checkIntervalMinutes} minutes</p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Auto-book:</span>
              <p className="font-medium text-gray-900">{watch.autoBook ? 'Enabled' : 'Disabled'}</p>
            </div>
            {watch.maxPrice && (
              <div>
                <span className="text-sm text-gray-500">Max Price:</span>
                <p className="font-medium text-gray-900">${watch.maxPrice}/night</p>
              </div>
            )}
            {watch.siteType && (
              <div>
                <span className="text-sm text-gray-500">Site Type:</span>
                <p className="font-medium text-gray-900">{watch.siteType}</p>
              </div>
            )}
          </div>
        </div>

        {/* Status Card */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Check Status
          </h3>
          <div className="space-y-2">
            <div>
              <span className="text-sm text-gray-500">Last Checked:</span>
              <p className="font-medium text-gray-900">
                {watch.lastCheckedAt
                  ? format(new Date(watch.lastCheckedAt), 'PPp')
                  : 'Never'}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Next Check:</span>
              <p className="font-medium text-gray-900">
                {watch.nextCheckAt && watch.isActive
                  ? format(new Date(watch.nextCheckAt), 'PPp')
                  : 'N/A'}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-500">Times Found:</span>
              <p className="font-medium text-gray-900">{watch.foundCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Availability Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Availability</h2>
          <div className="flex space-x-3">
            <button
              onClick={handleCheckNow}
              disabled={isChecking}
              className="btn-primary"
            >
              {isChecking ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Checking...
                </>
              ) : (
                'Check Now'
              )}
            </button>
          </div>
        </div>

        {/* Execution Result Info */}
        {executionResult && (
          <div className={`mb-4 p-3 rounded-lg ${executionResult.found ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className="flex items-center">
              {executionResult.found ? (
                <>
                  <svg className="h-5 w-5 text-green-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-green-800 font-medium">
                    Availability found! {executionResult.availability?.length || 0} matching site(s)
                  </span>
                </>
              ) : (
                <>
                  <svg className="h-5 w-5 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-yellow-800 font-medium">
                    No matching availability found
                  </span>
                </>
              )}
              <span className="ml-auto text-sm text-gray-500">
                Checked at {format(new Date(executionResult.checkedAt), 'PPp')}
              </span>
            </div>
          </div>
        )}

        {/* Stored Availability Info (when no manual check has been done) */}
        {!executionResult && watch.lastAvailability && watch.lastAvailability.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="text-blue-800 font-medium">
                Last check found {watch.lastAvailability.length} matching site(s)
              </span>
              {watch.lastCheckedAt && (
                <span className="ml-auto text-sm text-gray-500">
                  As of {format(new Date(watch.lastCheckedAt), 'PPp')}
                </span>
              )}
            </div>
          </div>
        )}

        {!executionResult && (!watch.lastAvailability || watch.lastAvailability.length === 0) && watch.lastCheckedAt && (
          <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="text-gray-700">
                No matching availability found in last check
              </span>
              <span className="ml-auto text-sm text-gray-500">
                As of {format(new Date(watch.lastCheckedAt), 'PPp')}
              </span>
            </div>
          </div>
        )}

        {/* Availability Grid - show executionResult if available, otherwise show stored lastAvailability */}
        <AvailabilityGrid
          watchResults={executionResult?.availability || watch.lastAvailability}
          availabilityData={availabilityData || undefined}
          arrivalDate={watch.arrivalDate}
          departureDate={watch.departureDate}
          isLoading={isChecking}
        />
      </div>

      {/* Notes */}
      {watch.notes && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">
            Notes
          </h3>
          <p className="text-gray-700 whitespace-pre-wrap">{watch.notes}</p>
        </div>
      )}
    </div>
  );
};

export default WatchDetail;
