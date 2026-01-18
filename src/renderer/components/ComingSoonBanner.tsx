/**
 * Coming Soon Banner Component
 * Dismissible banner to indicate a feature is under development
 */

import React, { useState } from 'react';

interface ComingSoonBannerProps {
  featureName: string;
  storageKey?: string;
}

const ComingSoonBanner: React.FC<ComingSoonBannerProps> = ({ featureName, storageKey }) => {
  const key = storageKey || `comingSoonDismissed_${featureName.replace(/\s+/g, '_')}`;
  const [isDismissed, setIsDismissed] = useState(() => {
    return localStorage.getItem(key) === 'true';
  });

  const handleDismiss = () => {
    localStorage.setItem(key, 'true');
    setIsDismissed(true);
  };

  if (isDismissed) {
    return null;
  }

  return (
    <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between">
      <div className="flex items-center">
        <span className="text-amber-500 text-xl mr-3">⚠️</span>
        <div>
          <span className="font-medium text-amber-800">Coming Soon:</span>
          <span className="text-amber-700 ml-2">
            The {featureName} feature is under development and may not be fully functional.
          </span>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="ml-4 text-amber-600 hover:text-amber-800 p-1"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
};

export default ComingSoonBanner;
