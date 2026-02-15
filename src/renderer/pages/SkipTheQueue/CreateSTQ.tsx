/**
 * Create Beat the Crowd Entry Page
 * Form for creating a new advance-booking entry
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import STQForm from '../../components/forms/STQForm';
import { STQSchemaType } from '../../../shared/schemas/stq.schema';

const CreateSTQ: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  const handleSubmit = async (data: STQSchemaType) => {
    try {
      setError('');
      const response = await window.api.stq.create(1, data);

      if (response.success) {
        setShowSuccessToast(true);
        setTimeout(() => {
          navigate('/skip-the-queue');
        }, 1500);
      } else {
        setError(response.error || 'Failed to create STQ entry');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleCancel = () => {
    navigate('/skip-the-queue');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/skip-the-queue')}
          className="text-primary-600 hover:text-primary-700 text-sm font-medium mb-4"
        >
          ← Back to Beat the Crowd
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Create Beat the Crowd Entry</h1>
        <p className="mt-2 text-gray-600">
          Automatically cancel and rebook your reservation as the 180-day booking window advances,
          securing popular campsites well before others can book them
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
        <STQForm onSubmit={handleSubmit} onCancel={handleCancel} submitLabel="Create STQ Entry" />
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
          <span>STQ entry created successfully!</span>
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
              <h4 className="text-sm font-medium text-blue-900">What is Beat the Crowd?</h4>
              <p className="mt-1 text-sm text-blue-700">
                ParkStay only allows bookings up to 180 days in advance. Beat the Crowd helps you
                manage bookings ahead of this limit by booking a site now, then automatically
                cancelling and rebooking as you approach the 180-day limit — pushing your
                reservation further into the future and securing popular campsites before anyone
                else can book them.
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
              <h4 className="text-sm font-medium text-yellow-900">Requirements</h4>
              <p className="mt-1 text-sm text-yellow-700">
                You need a confirmed booking and valid ParkStay credentials set up in Settings. The
                feature monitors your booking and automatically handles the cancel-and-rebook cycle
                as the 180-day window advances.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* How it Works */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">How it Works</h3>
        <ol className="space-y-3 text-sm text-gray-700">
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-medium mr-3">
              1
            </span>
            <span>The app monitors your booking and the 180-day availability window</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-medium mr-3">
              2
            </span>
            <span>
              When new dates become available, it cancels your current booking and rebooks further
              out
            </span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-medium mr-3">
              3
            </span>
            <span>You&apos;ll receive a notification with your new booking details</span>
          </li>
          <li className="flex items-start">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-medium mr-3">
              4
            </span>
            <span>The monitoring stops after successful rebooking or max attempts reached</span>
          </li>
        </ol>
      </div>
    </div>
  );
};

export default CreateSTQ;
