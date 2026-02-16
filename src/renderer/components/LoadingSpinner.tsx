/**
 * Loading Spinner Component
 * Displays a loading animation
 */

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  text,
  fullScreen = false,
}) => {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };

  const spinner = (
    <div className="text-center">
      <div
        className={`animate-spin rounded-full border-b-2 border-primary-600 mx-auto ${sizeClasses[size]}`}
      ></div>
      {text && <p className="mt-4 text-gray-600">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return <div className="flex items-center justify-center min-h-screen">{spinner}</div>;
  }

  return spinner;
};

export default LoadingSpinner;
