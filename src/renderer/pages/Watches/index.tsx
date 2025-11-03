import React, { useState, useEffect } from 'react';
import { Watch } from '@shared/types';

/**
 * Watches Page
 * Lists all watches and allows creating new ones
 */
export default function WatchesPage() {
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadWatches();
  }, []);

  const loadWatches = async () => {
    try {
      setLoading(true);
      // This would call the IPC API
      // const result = await window.api.watch.list(userId);
      // setWatches(result.data);
      setWatches([]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      // await window.api.watch.activate(id);
      await loadWatches();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeactivate = async (id: number) => {
    try {
      // await window.api.watch.deactivate(id);
      await loadWatches();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleExecute = async (id: number) => {
    try {
      // await window.api.watch.execute(id);
      alert('Watch executed successfully');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this watch?')) return;

    try {
      // await window.api.watch.delete(id);
      await loadWatches();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading watches...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Watches</h1>
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => {
            /* Navigate to create watch page */
          }}
        >
          Create Watch
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">{error}</div>
      )}

      {watches.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No watches found</p>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => {
              /* Navigate to create watch page */
            }}
          >
            Create Your First Watch
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {watches.map((watch) => (
            <div
              key={watch.id}
              className="border rounded-lg p-4 bg-white shadow-sm"
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-xl font-semibold">{watch.name}</h3>
                  <p className="text-gray-600">{watch.campgroundName}</p>
                </div>
                <span
                  className={`px-2 py-1 rounded text-sm ${
                    watch.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {watch.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="mb-3 text-sm text-gray-600">
                <p>
                  Dates: {new Date(watch.arrivalDate).toLocaleDateString()} -{' '}
                  {new Date(watch.departureDate).toLocaleDateString()}
                </p>
                <p>Guests: {watch.numGuests}</p>
                <p>Check Interval: {watch.checkIntervalMinutes} minutes</p>
                {watch.lastCheckedAt && (
                  <p>
                    Last Checked:{' '}
                    {new Date(watch.lastCheckedAt).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                {watch.isActive ? (
                  <button
                    onClick={() => handleDeactivate(watch.id)}
                    className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => handleActivate(watch.id)}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Activate
                  </button>
                )}
                <button
                  onClick={() => handleExecute(watch.id)}
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Check Now
                </button>
                <button
                  onClick={() => handleDelete(watch.id)}
                  className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
