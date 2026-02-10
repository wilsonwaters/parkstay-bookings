/**
 * Update Notification Component
 * Shows a toast/banner when an app update is available
 */

import React, { useState, useEffect } from 'react';

type UpdateState = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

const UpdateNotification: React.FC = () => {
  const [state, setState] = useState<UpdateState>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    window.api.on.updateAvailable((data) => {
      setVersion(data.version);
      setState('available');
      setDismissed(false);
    });

    window.api.on.updateDownloaded((data) => {
      setVersion(data.version);
      setState('downloaded');
      setDismissed(false);
    });

    window.api.on.updateProgress((data) => {
      setState('downloading');
      setProgress(Math.round(data.percent));
    });

    window.api.on.updateError((data) => {
      setError(data.error);
      setState('error');
    });

    return () => {
      window.api.off.updateAvailable();
      window.api.off.updateDownloaded();
      window.api.off.updateProgress();
      window.api.off.updateError();
    };
  }, []);

  if (dismissed || state === 'idle') return null;

  const handleDownload = async () => {
    setState('downloading');
    setProgress(0);
    await window.api.updater.downloadUpdate();
  };

  const handleInstall = async () => {
    await window.api.updater.installUpdate();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm w-full">
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {state === 'available' && (
              <>
                <p className="text-sm font-medium text-gray-900">
                  Update Available
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Version {version} is ready to download.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleDownload}
                    className="btn-primary text-sm px-3 py-1.5"
                  >
                    Download
                  </button>
                  <button
                    onClick={() => setDismissed(true)}
                    className="btn-secondary text-sm px-3 py-1.5"
                  >
                    Later
                  </button>
                </div>
              </>
            )}

            {state === 'downloading' && (
              <>
                <p className="text-sm font-medium text-gray-900">
                  Downloading Update...
                </p>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">{progress}%</p>
              </>
            )}

            {state === 'downloaded' && (
              <>
                <p className="text-sm font-medium text-gray-900">
                  Update Ready
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Version {version} is ready. Restart to apply.
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleInstall}
                    className="btn-primary text-sm px-3 py-1.5"
                  >
                    Restart Now
                  </button>
                  <button
                    onClick={() => setDismissed(true)}
                    className="btn-secondary text-sm px-3 py-1.5"
                  >
                    Later
                  </button>
                </div>
              </>
            )}

            {state === 'error' && (
              <>
                <p className="text-sm font-medium text-red-800">
                  Update Error
                </p>
                <p className="text-sm text-red-600 mt-1">{error}</p>
                <button
                  onClick={() => setDismissed(true)}
                  className="btn-secondary text-sm px-3 py-1.5 mt-3"
                >
                  Dismiss
                </button>
              </>
            )}
          </div>

          {state !== 'downloading' && (
            <button
              onClick={() => setDismissed(true)}
              className="text-gray-400 hover:text-gray-600 ml-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UpdateNotification;
