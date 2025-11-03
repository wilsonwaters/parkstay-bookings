import React, { useState, useEffect } from 'react';
import { SkipTheQueueEntry } from '@shared/types';

/**
 * Skip The Queue Page
 * Lists all STQ entries and allows creating new ones
 */
export default function SkipTheQueuePage() {
  const [entries, setEntries] = useState<SkipTheQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      setLoading(true);
      // This would call the IPC API
      // const result = await window.api.stq.list(userId);
      // setEntries(result.data);
      setEntries([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      // await window.api.stq.activate(id);
      await loadEntries();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeactivate = async (id: number) => {
    try {
      // await window.api.stq.deactivate(id);
      await loadEntries();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleExecute = async (id: number) => {
    try {
      // await window.api.stq.execute(id);
      alert('STQ check executed successfully');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this STQ entry?')) return;

    try {
      // await window.api.stq.delete(id);
      await loadEntries();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading Skip The Queue entries...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Skip The Queue</h1>
          <p className="text-gray-600 mt-1">
            Automatically rebook cancelled bookings
          </p>
        </div>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => {
            /* Navigate to create STQ page */
          }}
        >
          Create STQ Entry
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No Skip The Queue entries found</p>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => {
              /* Navigate to create STQ page */
            }}
          >
            Create Your First Entry
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="border rounded-lg p-4 bg-white shadow-sm"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-xl font-semibold">
                    {entry.bookingReference}
                  </h3>
                  {entry.newBookingReference && (
                    <p className="text-green-600 font-medium">
                      Rebooked: {entry.newBookingReference}
                    </p>
                  )}
                </div>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    entry.successDate
                      ? 'bg-green-100 text-green-800'
                      : entry.isActive
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {entry.successDate
                    ? 'Success'
                    : entry.isActive
                    ? 'Active'
                    : 'Inactive'}
                </span>
              </div>

              <div className="mb-3 text-sm text-gray-600">
                <p>Check Interval: {entry.checkIntervalMinutes} minutes</p>
                <p>
                  Attempts: {entry.attemptsCount} / {entry.maxAttempts}
                </p>
                {entry.lastCheckedAt && (
                  <p>
                    Last Checked:{' '}
                    {new Date(entry.lastCheckedAt).toLocaleString()}
                  </p>
                )}
                {entry.successDate && (
                  <p>
                    Success Date: {new Date(entry.successDate).toLocaleString()}
                  </p>
                )}
              </div>

              {!entry.successDate && (
                <div className="flex gap-2">
                  {entry.isActive ? (
                    <button
                      onClick={() => handleDeactivate(entry.id)}
                      className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(entry.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Activate
                    </button>
                  )}
                  <button
                    onClick={() => handleExecute(entry.id)}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Check Now
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
