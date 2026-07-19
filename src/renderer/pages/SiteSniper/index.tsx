import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SiteSnipe, SnipeStatus } from '@shared/types';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import ToastContainer, { useToast } from '../../components/Toast';

/**
 * Map a snipe status to a Tailwind badge colour.
 */
function statusBadgeClass(status: SnipeStatus): string {
  switch (status) {
    case SnipeStatus.HELD:
      return 'bg-amber-100 text-amber-800';
    case SnipeStatus.BOOKED:
      return 'bg-green-100 text-green-800';
    case SnipeStatus.SNIPING:
    case SnipeStatus.QUEUEING:
      return 'bg-purple-100 text-purple-800';
    case SnipeStatus.ARMED:
    case SnipeStatus.WAITING_RELEASE:
      return 'bg-blue-100 text-blue-800';
    case SnipeStatus.FAILED:
    case SnipeStatus.EXPIRED:
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Format a millisecond duration as a human countdown (e.g. "2d 04:11:09").
 */
function formatCountdown(ms: number): string {
  if (ms <= 0) return 'now';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

/**
 * Site Sniper Page
 * Lists all snipes and allows creating/managing them.
 */
export default function SiteSniperPage() {
  const navigate = useNavigate();
  const [snipes, setSnipes] = useState<SiteSnipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: number | null }>({
    isOpen: false,
    id: null,
  });
  const { toasts, removeToast, success, error: showError } = useToast();

  useEffect(() => {
    loadSnipes();

    // Refresh the list when the main process pushes a status update.
    window.api.on.snipeStatusUpdate(() => {
      loadSnipes();
    });

    return () => {
      window.api.off.snipeStatusUpdate();
    };
  }, []);

  // Tick every second to drive the live countdowns.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadSnipes = async () => {
    try {
      setLoading(true);
      setError(null);
      // Hardcoded userId 1 (consistent with the rest of the app).
      const result = await window.api.siteSniper.list(1);
      if (result.success && result.data) {
        setSnipes(result.data);
      } else {
        setError(result.error || 'Failed to load snipes');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading snipes');
      showError('Failed to load snipes');
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      setActionLoading(id);
      const result = await window.api.siteSniper.activate(id);
      if (result.success) {
        success('Snipe armed');
        await loadSnipes();
      } else {
        showError(result.error || 'Failed to arm snipe');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while arming snipe');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (id: number) => {
    try {
      setActionLoading(id);
      const result = await window.api.siteSniper.deactivate(id);
      if (result.success) {
        success('Snipe disarmed');
        await loadSnipes();
      } else {
        showError(result.error || 'Failed to disarm snipe');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while disarming snipe');
    } finally {
      setActionLoading(null);
    }
  };

  const handleExecute = async (id: number) => {
    try {
      setActionLoading(id);
      const result = await window.api.siteSniper.execute(id);
      if (result.success) {
        success('Snipe attempt executed');
        await loadSnipes();
      } else {
        showError(result.error || 'Failed to run snipe');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while running snipe');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm.id) return;

    try {
      setActionLoading(deleteConfirm.id);
      const result = await window.api.siteSniper.delete(deleteConfirm.id);
      if (result.success) {
        success('Snipe deleted');
        await loadSnipes();
      } else {
        showError(result.error || 'Failed to delete snipe');
      }
    } catch (err: any) {
      showError(err.message || 'An error occurred while deleting snipe');
    } finally {
      setActionLoading(null);
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const handleCompletePayment = (url: string) => {
    window.open(url, '_blank');
  };

  if (loading) {
    return <LoadingSpinner size="lg" text="Loading snipes..." fullScreen />;
  }

  return (
    <>
      <div className="p-6">
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Site Sniper</h1>
            <p className="text-gray-600 mt-1">
              Automatically book a high-demand campsite the instant it opens, then hold it for 30
              minutes so you can complete payment.
            </p>
          </div>
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => navigate('/site-sniper/create')}
          >
            New Snipe
          </button>
        </div>

        {/* Compliance disclaimer */}
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <strong>Book responsibly:</strong> one DBCA account per person, one booking per night, and
          only for a stay you genuinely intend to take (identity is verified on arrival). Site
          Sniper only places a 30-minute temporary hold — you complete payment yourself.
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={loadSnipes}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {snipes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-4">No snipes yet</p>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => navigate('/site-sniper/create')}
            >
              Create Your First Snipe
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {snipes.map((snipe) => {
              const releaseAt = snipe.releaseAt ? new Date(snipe.releaseAt).getTime() : null;
              const countdownMs = releaseAt !== null ? releaseAt - now : null;
              const heldExpiresAt = snipe.heldExpiresAt
                ? new Date(snipe.heldExpiresAt).getTime()
                : null;
              const holdRemainingMs = heldExpiresAt !== null ? heldExpiresAt - now : null;
              return (
                <div key={snipe.id} className="border rounded-lg p-4 bg-white shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-xl font-semibold">{snipe.name}</h3>
                      <p className="text-gray-600">{snipe.campgroundName || snipe.campgroundId}</p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-sm capitalize ${statusBadgeClass(
                        snipe.status
                      )}`}
                    >
                      {snipe.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="mb-3 text-sm text-gray-600">
                    <p>
                      Dates: {new Date(snipe.arrivalDate).toLocaleDateString()} -{' '}
                      {new Date(snipe.departureDate).toLocaleDateString()}
                    </p>
                    <p>
                      Release:{' '}
                      <span className="capitalize">{snipe.releaseMode.replace(/_/g, ' ')}</span>
                      {countdownMs !== null && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {countdownMs > 0
                            ? `Opens in ${formatCountdown(countdownMs)}`
                            : 'Open now'}
                        </span>
                      )}
                    </p>
                    <p>
                      Attempts: {snipe.attemptsCount}
                      {snipe.maxAttempts > 0 ? ` / ${snipe.maxAttempts}` : ''}
                    </p>
                    {snipe.lastCheckedAt && (
                      <p>Last checked: {new Date(snipe.lastCheckedAt).toLocaleString()}</p>
                    )}
                    {snipe.lastError && (
                      <p className="text-red-600">Last error: {snipe.lastError}</p>
                    )}
                  </div>

                  {/* Payment hand-off when a hold has been placed */}
                  {snipe.status === SnipeStatus.HELD && snipe.paymentUrl && (
                    <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded">
                      <p className="text-sm text-amber-800 mb-2">
                        A site is being held for you
                        {holdRemainingMs !== null && holdRemainingMs > 0
                          ? ` — ${formatCountdown(holdRemainingMs)} left to pay`
                          : ''}
                        . Complete payment now to confirm your booking.
                      </p>
                      <button
                        onClick={() => handleCompletePayment(snipe.paymentUrl as string)}
                        className="px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 font-medium"
                      >
                        Complete payment →
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {snipe.isActive ? (
                      <button
                        onClick={() => handleDeactivate(snipe.id)}
                        disabled={actionLoading === snipe.id}
                        className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === snipe.id ? 'Processing...' : 'Disarm'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleActivate(snipe.id)}
                        disabled={actionLoading === snipe.id}
                        className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === snipe.id ? 'Processing...' : 'Arm'}
                      </button>
                    )}
                    <button
                      onClick={() => handleExecute(snipe.id)}
                      disabled={actionLoading === snipe.id}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading === snipe.id ? 'Running...' : 'Run now'}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ isOpen: true, id: snipe.id })}
                      disabled={actionLoading === snipe.id}
                      className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Snipe"
        message="Are you sure you want to delete this snipe? This action cannot be undone."
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
