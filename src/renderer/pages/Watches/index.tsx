import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Watch } from '@shared/types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import ToastContainer, { useToast } from '../../components/Toast';

/**
 * Watches Page
 * Lists all watches and allows creating new ones
 */
export default function WatchesPage() {
  const navigate = useNavigate();
  const [watches, setWatches] = useState<Watch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: number | null }>({
    isOpen: false,
    id: null,
  });
  const { toasts, removeToast, success, error: showError } = useToast();

  useEffect(() => {
    loadWatches();
  }, []);

  const loadWatches = async () => {
    try {
      setLoading(true);
      setError(null);
      // Get current user ID - for now we'll use userId 1
      // In a real app, this would come from auth context
      const result = await window.api.watch.list(1);
      if (result.success && result.data) {
        setWatches(result.data);
      } else {
        setError(result.error || 'Failed to load watches');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading watches');
      showError('Failed to load watches');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      setActionLoading(id);
      const result = await window.api.watch.activate(id);
      if (result.success) {
        success('Watch activated successfully');
        await loadWatches();
      } else {
        showError(result.error || 'Failed to activate watch');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while activating watch');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (id: number) => {
    try {
      setActionLoading(id);
      const result = await window.api.watch.deactivate(id);
      if (result.success) {
        success('Watch deactivated successfully');
        await loadWatches();
      } else {
        showError(result.error || 'Failed to deactivate watch');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while deactivating watch');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecute = async (id: number) => {
    try {
      setActionLoading(id);
      const result = await window.api.watch.execute(id);
      if (result.success) {
        success('Watch executed successfully');
      } else {
        showError(result.error || 'Failed to execute watch');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while executing watch');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;

    try {
      setActionLoading(deleteConfirm.id);
      const result = await window.api.watch.delete(deleteConfirm.id);
      if (result.success) {
        success('Watch deleted successfully');
        await loadWatches();
      } else {
        showError(result.error || 'Failed to delete watch');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while deleting watch');
    } finally {
      setActionLoading(null);
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  if (loading) {
    return <LoadingSpinner size="lg" text="Loading watches..." fullScreen />;
  }

  return (
    <>
      <div className="p-6">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold">Watches</h1>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => navigate('/watches/create')}
          >
            Create Watch
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={loadWatches}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {watches.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No watches found</p>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => navigate('/watches/create')}
            >
              Create Your First Watch
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {watches.map((watch) => (
              <div key={watch.id} className="border rounded-lg p-4 bg-white shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="text-xl font-semibold">{watch.name}</h3>
                    <p className="text-gray-600">{watch.campgroundName}</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-sm ${
                      watch.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
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
                    <p>Last Checked: {new Date(watch.lastCheckedAt).toLocaleString()}</p>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => navigate(`/watches/${watch.id}`)}
                    className="px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700"
                  >
                    View
                  </button>
                  {watch.isActive ? (
                    <button
                      onClick={() => handleDeactivate(watch.id)}
                      disabled={actionLoading === watch.id}
                      className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === watch.id ? 'Processing...' : 'Deactivate'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(watch.id)}
                      disabled={actionLoading === watch.id}
                      className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === watch.id ? 'Processing...' : 'Activate'}
                    </button>
                  )}
                  <button
                    onClick={() => handleExecute(watch.id)}
                    disabled={actionLoading === watch.id}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading === watch.id ? 'Checking...' : 'Check Now'}
                  </button>
                  <button
                    onClick={() => navigate(`/watches/${watch.id}/edit`)}
                    disabled={actionLoading === watch.id}
                    className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ isOpen: true, id: watch.id })}
                    disabled={actionLoading === watch.id}
                    className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Watch"
        message="Are you sure you want to delete this watch? This action cannot be undone."
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
