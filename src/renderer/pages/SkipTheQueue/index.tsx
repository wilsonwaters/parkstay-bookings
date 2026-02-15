import { useState, useEffect } from 'react';
import { SkipTheQueueEntry } from '@shared/types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import ToastContainer, { useToast } from '../../components/Toast';
import ComingSoonBanner from '../../components/ComingSoonBanner';

/**
 * Beat the Crowd Page
 * Lists all advance-booking entries and allows creating new ones
 */
export default function SkipTheQueuePage() {
  const [entries, setEntries] = useState<SkipTheQueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: number | null }>({
    isOpen: false,
    id: null,
  });
  const { toasts, removeToast, success, error: showError } = useToast();

  useEffect(() => {
    loadEntries();
  }, []);

  const loadEntries = async () => {
    try {
      setLoading(true);
      setError(null);
      // Get current user ID - for now we'll use userId 1
      // In a real app, this would come from auth context
      const result = await window.api.stq.list(1);
      if (result.success && result.data) {
        setEntries(result.data);
      } else {
        setError(result.error || 'Failed to load STQ entries');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading STQ entries');
      showError('Failed to load STQ entries');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      setActionLoading(id);
      const result = await window.api.stq.activate(id);
      if (result.success) {
        success('STQ entry activated successfully');
        await loadEntries();
      } else {
        showError(result.error || 'Failed to activate STQ entry');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while activating STQ entry');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (id: number) => {
    try {
      setActionLoading(id);
      const result = await window.api.stq.deactivate(id);
      if (result.success) {
        success('STQ entry deactivated successfully');
        await loadEntries();
      } else {
        showError(result.error || 'Failed to deactivate STQ entry');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while deactivating STQ entry');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecute = async (id: number) => {
    try {
      setActionLoading(id);
      const result = await window.api.stq.execute(id);
      if (result.success) {
        success('STQ check executed successfully');
      } else {
        showError(result.error || 'Failed to execute STQ check');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while executing STQ check');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;

    try {
      setActionLoading(deleteConfirm.id);
      const result = await window.api.stq.delete(deleteConfirm.id);
      if (result.success) {
        success('STQ entry deleted successfully');
        await loadEntries();
      } else {
        showError(result.error || 'Failed to delete STQ entry');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while deleting STQ entry');
    } finally {
      setActionLoading(null);
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  if (loading) {
    return <LoadingSpinner size="lg" text="Loading Beat the Crowd entries..." fullScreen />;
  }

  return (
    <>
      <div className="p-6">
        {/* Coming Soon Banner */}
        <ComingSoonBanner featureName="Beat the Crowd" />

        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Beat the Crowd</h1>
            <p className="text-gray-600 mt-1">
              Book popular campsites well in advance by automatically rebooking as the 180-day window moves
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
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={loadEntries}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

      {entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No Beat the Crowd entries found</p>
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
                      disabled={actionLoading === entry.id}
                      className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === entry.id ? 'Processing...' : 'Deactivate'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(entry.id)}
                      disabled={actionLoading === entry.id}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === entry.id ? 'Processing...' : 'Activate'}
                    </button>
                  )}
                  <button
                    onClick={() => handleExecute(entry.id)}
                    disabled={actionLoading === entry.id}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === entry.id ? 'Checking...' : 'Check Now'}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ isOpen: true, id: entry.id })}
                    disabled={actionLoading === entry.id}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Entry"
        message="Are you sure you want to delete this Beat the Crowd entry? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
      />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
