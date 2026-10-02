/**
 * Create Site Snipe Page
 * Form for creating a new Site Snipe.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SiteSniperForm from '../../components/forms/SiteSniperForm';
import { SiteSnipeSchemaType } from '../../../shared/schemas/site-sniper.schema';

const CreateSiteSnipe: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleSubmit = async (data: SiteSnipeSchemaType) => {
    try {
      setError('');
      const response = await window.api.siteSniper.create(1, data);

      if (response.success) {
        setShowSuccessToast(true);
        setTimeout(() => {
          navigate('/site-sniper');
        }, 1500);
      } else {
        setError(response.error || 'Failed to create snipe');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleCancel = () => {
    navigate('/site-sniper');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/site-sniper')}
          className="text-primary-600 hover:text-primary-700 text-sm font-medium mb-4"
        >
          ← Back to Site Sniper
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Create Site Snipe</h1>
        <p className="mt-2 text-gray-600">
          Automatically book a high-demand campsite at the earliest legal moment it opens, then
          place a 30-minute hold so you can complete payment yourself.
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
        <SiteSniperForm
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          submitLabel="Create Snipe"
        />
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
          <span>Snipe created successfully!</span>
        </div>
      )}

      {/* How it Works */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">How it Works</h3>
        <ol className="space-y-3 text-sm text-gray-700">
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-medium mr-3">
              1
            </span>
            <span>
              The app arms your snipe and waits for the exact release instant (daily midnight
              rollover, a scheduled release, or a freed cancellation).
            </span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-medium mr-3">
              2
            </span>
            <span>
              At release it tight-polls availability and places a 30-minute temporary hold the
              instant your site opens.
            </span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-medium mr-3">
              3
            </span>
            <span>
              You receive a notification with a payment link — complete payment yourself within the
              30-minute window to confirm the booking.
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
};

export default CreateSiteSnipe;
