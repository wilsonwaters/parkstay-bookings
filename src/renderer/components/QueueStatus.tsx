/**
 * Queue Status Component
 * Displays the current queue status for the DBCA ParkStay queue system
 */

import React, { useState, useEffect, useCallback } from 'react';
import { QueueSession, QueueStatusEvent } from '../../shared/types';

interface QueueStatusState {
  session: QueueSession | null;
  isActive: boolean;
  isExpired: boolean;
  isWaiting: boolean;
  estimatedWait: string;
  expiryRemaining: string;
}

const QueueStatus: React.FC = () => {
  const [status, setStatus] = useState<QueueStatusState | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await window.api.queue.getStatus();
      if (response.success && response.data) {
        setStatus(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch queue status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch initial status
    fetchStatus();

    // Subscribe to queue status updates
    window.api.on.queueStatusUpdate((event: QueueStatusEvent) => {
      if (event.session) {
        setStatus((prev) => ({
          ...prev!,
          session: event.session!,
          isActive: event.session!.status === 'Active',
          isWaiting: event.type === 'position_update',
          isExpired: false,
        }));
      }

      if (event.type === 'session_expired') {
        setStatus((prev) => ({
          ...prev!,
          isExpired: true,
          isActive: false,
        }));
      }
    });

    // Refresh status periodically when active (to update expiry countdown)
    const interval = setInterval(fetchStatus, 10000);

    return () => {
      window.api.off.queueStatusUpdate();
      clearInterval(interval);
    };
  }, [fetchStatus]);

  // Don't render if no session data yet
  if (isLoading || !status || !status.session) {
    return null;
  }

  const { session, isActive, isWaiting, expiryRemaining } = status;

  // Determine status color
  const getStatusColor = () => {
    if (isActive) return 'bg-green-500';
    if (isWaiting) return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  const getStatusText = () => {
    if (isActive) return 'Active';
    if (isWaiting) return 'In Queue';
    return session.status;
  };

  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 z-50 cursor-pointer"
        onClick={() => setIsMinimized(false)}
      >
        <div
          className={`${getStatusColor()} text-white px-3 py-2 rounded-full shadow-lg flex items-center gap-2`}
        >
          <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
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

          {isWaiting && session.position > 0 && (
            <>
              <div className="flex justify-between">
                <span className="text-gray-600">Position:</span>
                <span className="font-medium text-gray-800">#{session.position}</span>
              </div>
              {session.estimatedWaitSeconds > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Est. Wait:</span>
                  <span className="font-medium text-gray-800">
                    ~{Math.ceil(session.estimatedWaitSeconds / 60)} min
                  </span>
                </div>
              )}
            </>
          )}

          {isActive && (
            <div className="flex justify-between">
              <span className="text-gray-600">Expires in:</span>
              <span className="font-medium text-gray-800">{expiryRemaining}</span>
            </div>
          )}
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
