/**
 * Edit Watch Page
 * Form for editing an existing availability watch
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import WatchForm from '../../components/forms/WatchForm';
import { WatchSchemaType } from '../../../shared/schemas/watch.schema';
import { Watch } from '../../../shared/types';

const EditWatch: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [watch, setWatch] = useState<Watch | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  useEffect(() => {
    loadWatch();
  }, [id]);

  const loadWatch = async () => {
    try {
      setIsLoading(true);
      setError('');

      if (!id) {
        setError('Invalid watch ID');
        return;
      }

      const response = await window.api.watch.get(parseInt(id));

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
  };

  const handleSubmit = async (data: WatchSchemaType) => {
    try {
      setError('');

      if (!id) {
        setError('Invalid watch ID');
        return;
      }

      const response = await window.api.watch.update(parseInt(id), data);

      if (response.success) {
        setShowSuccessToast(true);
        setTimeout(() => {
          navigate('/watches');
        }, 1500);
      } else {
        setError(response.error || 'Failed to update watch');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    }
  };

  const handleCancel = () => {
    navigate('/watches');
  };

  const handleDelete = async () => {
    if (!id) return;

    if (window.confirm('Are you sure you want to delete this watch? This action cannot be undone.')) {
      try {
        const response = await window.api.watch.delete(parseInt(id));
        if (response.success) {
          navigate('/watches');
        } else {
          setError(response.error || 'Failed to delete watch');
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading watch...</p>
        </div>
      </div>
    );
  }

  if (error && !watch) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          onClick={() => navigate('/watches')}
          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
        >
          ← Back to Watches
        </button>
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">{error}</h3>
              <button
                onClick={loadWatch}
                className="mt-2 text-sm text-red-600 hover:text-red-500"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Watch</h1>
            <p className="mt-2 text-gray-600">
              Update your availability watch settings
            </p>
          </div>
          <button
            onClick={handleDelete}
            className="btn-danger"
          >
            Delete Watch
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
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
      {watch && (
        <div className="card">
          <WatchForm
            initialData={watch}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitLabel="Update Watch"
          />
        </div>
      )}

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
          <span>Watch updated successfully!</span>
        </div>
      )}

      {/* Watch Status */}
      {watch && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Watch Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Status</p>
              <p className="font-medium text-gray-900">
                {watch.isActive ? (
                  <span className="text-green-600">Active</span>
                ) : (
                  <span className="text-gray-600">Paused</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Sites Found</p>
              <p className="font-medium text-gray-900">{watch.foundCount}</p>
            </div>
            <div>
              <p className="text-gray-500">Last Checked</p>
              <p className="font-medium text-gray-900">
                {watch.lastCheckedAt
                  ? new Date(watch.lastCheckedAt).toLocaleString()
                  : 'Never'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Next Check</p>
              <p className="font-medium text-gray-900">
                {watch.nextCheckAt
                  ? new Date(watch.nextCheckAt).toLocaleString()
                  : 'Not scheduled'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditWatch;
