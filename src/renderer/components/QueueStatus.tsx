/**
 * Queue Status Component
 * Displays the state of the ParkStay provider's access gate (the DBCA queue), from
 * `providers.accessStatus('parkstay')` and `provider:access-status` events. U5 restyles it.
 */

import React, { useState, useEffect, useCallback } from 'react';
import type { AccessStatus } from '../../shared/types/provider.types';

const PROVIDER_ID = 'parkstay';

const STATE_TEXT: Record<AccessStatus['state'], string> = {
  unsupported: 'Unavailable',
  idle: 'Idle',
  waiting: 'In Queue',
  active: 'Active',
  expired: 'Expired',
  error: 'Error',
};

/** Minutes and seconds until `iso`, e.g. `4m 05s`; `Expired` once it has passed. */
function timeLeft(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const remaining = Date.parse(iso) - now;
  if (!(remaining > 0)) return 'Expired';
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`;
}

const QueueStatus: React.FC = () => {
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const fetchStatus = useCallback(async () => {
    try {
      const response = await window.api.providers.accessStatus(PROVIDER_ID);
      if (response.success && response.data) {
        setStatus(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch queue status:', error);
    }
  }, []);

  useEffect(() => {
    // Fetch initial status
    fetchStatus();

    // Subscribe to the provider's access gate updates
    const unsubscribe = window.api.events.on('provider:access-status', (event: AccessStatus) => {
      if (event.providerId === PROVIDER_ID) setStatus(event);
    });

    // Refresh periodically (the expiry countdown, and an expiry nobody announced)
    const interval = setInterval(() => {
      setNow(Date.now());
      void fetchStatus();
    }, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [fetchStatus]);

  // Nothing to show until the status is known, while nothing uses the queue (idle), or when
  // ParkStay has no queue
  if (!status || status.state === 'idle' || status.state === 'unsupported') {
    return null;
  }

  const isActive = status.state === 'active';
  const isWaiting = status.state === 'waiting';
  const expiryRemaining = timeLeft(status.expiresAt, now);

  // Determine status color
  const getStatusColor = () => {
    if (isActive) return 'bg-green-500';
    if (isWaiting) return 'bg-yellow-500';
    if (status.state === 'error') return 'bg-red-500';
    return 'bg-gray-500';
  };

  const getStatusText = () => STATE_TEXT[status.state];

  if (isMinimized) {
    return (
      <div
        className="pointer-events-auto cursor-pointer self-end"
        onClick={() => setIsMinimized(false)}
      >
        <div
          className={`${getStatusColor()} text-white px-3 py-2 rounded-full shadow-lg flex items-center gap-2`}
          title="ParkStay queue"
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 min-w-[200px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${getStatusColor()}`}></span>
            <span className="font-semibold text-gray-800">Queue Status</span>
          </div>
          <button
            onClick={() => setIsMinimized(true)}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            title="Minimize"
          >
            &minus;
          </button>
        </div>

        {/* Status Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Status:</span>
            <span
              className={`font-medium ${isActive ? 'text-green-600' : isWaiting ? 'text-yellow-600' : 'text-gray-600'}`}
            >
              {getStatusText()}
            </span>
          </div>

          {isWaiting && status.position !== undefined && status.position > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Position:</span>
              <span className="font-medium text-gray-800">#{status.position}</span>
            </div>
          )}
          {isWaiting && status.etaSeconds !== undefined && status.etaSeconds > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-600">Est. Wait:</span>
              <span className="font-medium text-gray-800">
                ~{Math.ceil(status.etaSeconds / 60)} min
              </span>
            </div>
          )}

          {isActive && expiryRemaining && (
            <div className="flex justify-between">
              <span className="text-gray-600">Expires in:</span>
              <span className="font-medium text-gray-800">{expiryRemaining}</span>
            </div>
          )}

          {status.message && <p className="text-xs text-gray-500">{status.message}</p>}
        </div>

        {/* Info text */}
        {isWaiting && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Waiting for access to ParkStay. Your position will update automatically.
            </p>
          </div>
        )}

        {isActive && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              You have access to ParkStay. Session will refresh automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QueueStatus;
