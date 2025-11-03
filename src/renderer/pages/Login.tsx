/**
 * Login Page
 * Handles user authentication and credential storage
 */

import React, { useState, useEffect } from 'react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [notInElectron, setNotInElectron] = useState(false);

  useEffect(() => {
    // Check if running in Electron
    if (typeof window.api === 'undefined') {
      setNotInElectron(true);
      setError(
        'This application must run in Electron. Please close this browser tab and run "npm start".'
      );
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Don't submit if not in Electron
    if (notInElectron) {
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await window.api.auth.storeCredentials({
        email,
        password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

      if (response.success) {
        onLogin();
      } else {
        setError(response.error || 'Failed to store credentials');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-xl shadow-lg">
        <div>
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            WA ParkStay Bookings
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Enter your ParkStay credentials to get started
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className={`rounded-md p-4 ${notInElectron ? 'bg-yellow-50' : 'bg-red-50'}`}>
              <div className="flex">
                <div className="ml-3">
                  <h3 className={`text-sm font-medium ${notInElectron ? 'text-yellow-800' : 'text-red-800'}`}>
                    {error}
                  </h3>
                  {notInElectron && (
                    <div className="mt-3 text-sm text-yellow-700">
                      <p className="font-semibold mb-2">To run this application:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Keep this dev server running (don't stop it)</li>
                        <li>Open a new terminal</li>
                        <li>Run: <code className="bg-yellow-100 px-1 rounded">npm start</code></li>
                        <li>The Electron app will open automatically</li>
                      </ol>
                      <p className="mt-2 text-xs">
                        Or run <code className="bg-yellow-100 px-1 rounded">npm run build && npm run build:win</code> to create an installer.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input mt-1"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                ParkStay Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="input mt-1"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Your password is encrypted and stored locally
              </p>
            </div>

            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                First Name (Optional)
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                className="input mt-1"
                placeholder="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                Last Name (Optional)
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                className="input mt-1"
                placeholder="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : 'Save Credentials & Continue'}
            </button>
          </div>

          <div className="mt-4">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Security Notice</span>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-500 text-center">
              Your credentials are encrypted using AES-256-GCM and stored locally on your device.
              They are never sent to any external servers.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
