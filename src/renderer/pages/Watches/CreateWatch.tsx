/**
 * Create Watch Page
 * Form for creating a new availability watch
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WatchForm from '../../components/forms/WatchForm';
import { WatchSchemaType } from '../../../shared/schemas/watch.schema';

const CreateWatch: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleSubmit = async (data: WatchSchemaType) => {
    try {
      setError('');
      const response = await window.api.watch.create(1, data);

      if (response.success) {
        setShowSuccessToast(true);
        setTimeout(() => {
          navigate('/watches');
        }, 1500);
      } else {
        setError(response.error || 'Failed to create watch');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleCancel = () => {
    navigate('/watches');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/watches')}
          className="text-primary-600 hover:text-primary-700 text-sm font-medium mb-4"
        >
          ← Back to Watches
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Create Watch</h1>
        <p className="mt-2 text-gray-600">
          Set up automated monitoring for campground availability
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="card">
        <WatchForm onSubmit={handleSubmit} onCancel={handleCancel} submitLabel="Create Watch" />
      </div>

      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2">
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span>Watch created successfully!</span>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <span className="text-2xl">💡</span>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-blue-900">How it works</h4>
              <p className="mt-1 text-sm text-blue-700">
                We&apos;ll check availability at your specified interval and notify you when sites
                become available. Enable auto-booking to secure sites automatically.
              </p>
            </div>
          </div>
        </div>

        <div className="card bg-yellow-50 border-yellow-200">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <span className="text-2xl">⚠️</span>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-yellow-900">Important</h4>
              <p className="mt-1 text-sm text-yellow-700">
                Auto-booking requires valid ParkStay credentials. Make sure to set them up in
                Settings before enabling this feature.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateWatch;
