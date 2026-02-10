/**
 * Import Booking Form Component
 * Form for importing a booking from ParkStay using reference number
 */

import React, { useState } from 'react';

interface ImportBookingFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const ImportBookingForm: React.FC<ImportBookingFormProps> = ({ onSuccess, onCancel }) => {
  const [reference, setReference] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reference.trim()) {
      setError('Please enter a booking reference');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      const response = await window.api.booking.import(reference.trim().toUpperCase());

      if (response.success) {
        onSuccess();
      } else {
        setError(response.error || 'Failed to import booking');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="reference" className="block text-sm font-medium text-gray-700 mb-1">
          Booking Reference Number *
        </label>
        <input
          id="reference"
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value.toUpperCase())}
          placeholder="e.g., ABC123XYZ"
          className="input"
          disabled={isLoading}
          maxLength={50}
        />
        <p className="mt-1 text-sm text-gray-500">
          Enter your ParkStay booking reference number (found in your confirmation email)
        </p>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>

      {/* Info Box */}
      <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <span className="text-xl">ℹ️</span>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-medium text-blue-900">How to find your reference</h4>
            <p className="mt-1 text-sm text-blue-700">
              Your booking reference is in the confirmation email you received from ParkStay.
              It&apos;s usually a combination of letters and numbers (e.g., ABC123XYZ).
            </p>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end space-x-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button type="submit" disabled={isLoading || !reference.trim()} className="btn-primary">
          {isLoading ? (
            <span className="flex items-center">
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Importing...
            </span>
          ) : (
            'Import Booking'
          )}
        </button>
      </div>
    </form>
  );
};

export default ImportBookingForm;
