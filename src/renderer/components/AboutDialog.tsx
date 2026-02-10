/**
 * About Dialog Component
 * Shows application info, version, system details
 */

import React, { useState, useEffect } from 'react';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AppInfo {
  name: string;
  version: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  os: string;
  arch: string;
  userDataPath: string;
  logsPath: string;
}

const AboutDialog: React.FC<AboutDialogProps> = ({ isOpen, onClose }) => {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAppInfo();
    }
  }, [isOpen]);

  const loadAppInfo = async () => {
    try {
      setLoading(true);
      const response = await window.api.app.getInfo();
      if (response.success && response.data) {
        setAppInfo(response.data);
      }
    } catch (error) {
      console.error('Failed to load app info:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLogs = async () => {
    await window.api.app.openLogsFolder();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="text-center mb-6">
          <h3 className="text-xl font-bold text-gray-900">WA ParkStay Bookings</h3>
          {appInfo && (
            <p className="text-lg text-primary-600 font-medium mt-1">v{appInfo.version}</p>
          )}
          <p className="text-sm text-gray-500 mt-2">
            Automated campground booking for Western Australia
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : appInfo ? (
          <div className="space-y-3 mb-6">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gray-500">Electron</span>
                <span className="text-gray-900 font-mono">{appInfo.electronVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Chrome</span>
                <span className="text-gray-900 font-mono">{appInfo.chromeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Node.js</span>
                <span className="text-gray-900 font-mono">{appInfo.nodeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">OS</span>
                <span className="text-gray-900 font-mono text-right">
                  {appInfo.os} ({appInfo.arch})
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={() =>
                window.open('https://github.com/wilsonwaters/parkstay-bookings', '_blank')
              }
              className="btn-secondary text-sm flex-1"
            >
              GitHub
            </button>
            <button
              onClick={() =>
                window.open('https://github.com/wilsonwaters/parkstay-bookings/issues', '_blank')
              }
              className="btn-secondary text-sm flex-1"
            >
              Report Issue
            </button>
            <button onClick={handleOpenLogs} className="btn-secondary text-sm flex-1">
              Open Logs
            </button>
          </div>
          <button onClick={onClose} className="btn-primary w-full">
            Close
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">MIT License</p>
      </div>
    </div>
  );
};

export default AboutDialog;
