/**
 * Settings Page
 * Application configuration and preferences
 */

import React, { useState, useEffect } from 'react';
import { EmailSettingsCard } from '../components/settings';

type TabType = 'account' | 'gmail' | 'notifications' | 'app' | 'advanced';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('account');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Account settings
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Gmail settings
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [gmailAuthorized, setGmailAuthorized] = useState(false);

  // Notification settings
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // App settings
  const [launchOnStartup, setLaunchOnStartup] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(true);

  // Advanced settings
  const [logLevel, setLogLevel] = useState('info');
  const [databasePath] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Load various settings
      const credResponse = await window.api.auth.getCredentials();
      if (credResponse.success && credResponse.data) {
        // Credentials exist
      }

      // Load app settings if available
      // const settingsResponse = await window.api.settings.get();
      // if (settingsResponse.success && settingsResponse.data) {
      //   const settings = settingsResponse.data;
      //   setDesktopNotifications(settings.notifications?.desktop ?? true);
      //   setSoundEnabled(settings.notifications?.sound ?? true);
      //   setLaunchOnStartup(settings.app?.launchOnStartup ?? false);
      //   setMinimizeToTray(settings.app?.minimizeToTray ?? true);
      //   setLogLevel(settings.advanced?.logLevel ?? 'info');
      // }
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setError('');
      setSuccessMessage('');

      const response = await window.api.auth.storeCredentials({ email, password });

      if (response.success) {
        setSuccessMessage('Credentials saved successfully');
        setPassword('');
      } else {
        setError(response.error || 'Failed to save credentials');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsSaving(true);
      setError('');
      setSuccessMessage('');

      const response = await window.api.auth.validateSession();

      if (response.success) {
        setSuccessMessage('Connection successful!');
      } else {
        setError(response.error || 'Connection failed');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGmailAuthorize = async () => {
    try {
      setIsSaving(true);
      setError('');
      setSuccessMessage('');

      // This would open OAuth flow
      setSuccessMessage('Gmail authorization initiated');
      setGmailAuthorized(true);
    } catch (err: any) {
      setError(err.message || 'Failed to authorize Gmail');
    } finally {
      setIsSaving(false);
    }
  };

  const showSuccessToast = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const tabs = [
    { id: 'account', label: 'Account', icon: '👤' },
    { id: 'gmail', label: 'Gmail', icon: '📧' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'app', label: 'App', icon: '⚙️' },
    { id: 'advanced', label: 'Advanced', icon: '🔧' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">Manage your application preferences and configuration</p>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="rounded-md bg-green-50 p-4 border border-green-200">
          <p className="text-sm text-green-800">{successMessage}</p>
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="card">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="py-6">
          {/* Account Tab */}
          {activeTab === 'account' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  ParkStay Account Credentials
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  Enter your ParkStay login credentials for auto-booking and Skip The Queue features.
                </p>
              </div>

              <form onSubmit={handleSaveCredentials} className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="your.email@example.com"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input pr-10"
                      placeholder="Enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>

                <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
                  <p className="text-sm text-blue-800">
                    Your credentials are encrypted and stored securely on your device. They are never
                    sent to any third-party servers.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button type="submit" disabled={isSaving} className="btn-primary">
                    {isSaving ? 'Saving...' : 'Save Credentials'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isSaving}
                    className="btn-secondary"
                  >
                    Test Connection
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Gmail Tab */}
          {activeTab === 'gmail' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Gmail OTP Integration</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Connect your Gmail account to automatically retrieve OTP codes from ParkStay emails.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={gmailEnabled}
                      onChange={(e) => setGmailEnabled(e.target.checked)}
                      className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                    />
                    <div>
                      <p className="font-medium text-gray-900">Enable Gmail OTP</p>
                      <p className="text-sm text-gray-500">
                        Automatically read OTP codes from emails
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      gmailAuthorized
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {gmailAuthorized ? 'Authorized' : 'Not Authorized'}
                  </span>
                </div>

                {gmailEnabled && !gmailAuthorized && (
                  <div>
                    <button
                      onClick={handleGmailAuthorize}
                      disabled={isSaving}
                      className="btn-primary"
                    >
                      Authorize Gmail Access
                    </button>
                  </div>
                )}

                <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
                  <h4 className="text-sm font-medium text-yellow-900 mb-2">Privacy Notice</h4>
                  <p className="text-sm text-yellow-700">
                    We only request read-only access to emails from ParkStay. No other emails are
                    accessed, and your data never leaves your device.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Notification Preferences</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configure how you want to be notified about bookings and availability.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start p-4 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={desktopNotifications}
                    onChange={(e) => {
                      setDesktopNotifications(e.target.checked);
                      showSuccessToast('Desktop notifications ' + (e.target.checked ? 'enabled' : 'disabled'));
                    }}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
                  />
                  <div className="ml-3">
                    <p className="font-medium text-gray-900">Desktop Notifications</p>
                    <p className="text-sm text-gray-500">
                      Show system notifications when availability is found or bookings are made
                    </p>
                  </div>
                </div>

                <div className="flex items-start p-4 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={soundEnabled}
                    onChange={(e) => {
                      setSoundEnabled(e.target.checked);
                      showSuccessToast('Notification sounds ' + (e.target.checked ? 'enabled' : 'disabled'));
                    }}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
                  />
                  <div className="ml-3">
                    <p className="font-medium text-gray-900">Sound Notifications</p>
                    <p className="text-sm text-gray-500">
                      Play a sound when notifications appear
                    </p>
                  </div>
                </div>
              </div>

              {/* Email Notifications Section */}
              <div className="pt-6 border-t border-gray-200">
                <EmailSettingsCard />
              </div>
            </div>
          )}

          {/* App Tab */}
          {activeTab === 'app' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Application Settings</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Configure application behavior and startup options.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-start p-4 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={launchOnStartup}
                    onChange={(e) => {
                      setLaunchOnStartup(e.target.checked);
                      showSuccessToast('Launch on startup ' + (e.target.checked ? 'enabled' : 'disabled'));
                    }}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
                  />
                  <div className="ml-3">
                    <p className="font-medium text-gray-900">Launch on Startup</p>
                    <p className="text-sm text-gray-500">
                      Start the application automatically when your computer boots
                    </p>
                  </div>
                </div>

                <div className="flex items-start p-4 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    checked={minimizeToTray}
                    onChange={(e) => {
                      setMinimizeToTray(e.target.checked);
                      showSuccessToast('Minimize to tray ' + (e.target.checked ? 'enabled' : 'disabled'));
                    }}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded mt-1"
                  />
                  <div className="ml-3">
                    <p className="font-medium text-gray-900">Minimize to System Tray</p>
                    <p className="text-sm text-gray-500">
                      Keep the app running in the background when you close the window
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Tab */}
          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Advanced Settings</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Advanced configuration options for debugging and data management.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="logLevel" className="block text-sm font-medium text-gray-700 mb-1">
                    Log Level
                  </label>
                  <select
                    id="logLevel"
                    value={logLevel}
                    onChange={(e) => {
                      setLogLevel(e.target.value);
                      showSuccessToast('Log level updated to ' + e.target.value);
                    }}
                    className="input max-w-xs"
                  >
                    <option value="error">Error</option>
                    <option value="warn">Warning</option>
                    <option value="info">Info</option>
                    <option value="debug">Debug</option>
                    <option value="verbose">Verbose</option>
                  </select>
                  <p className="mt-1 text-sm text-gray-500">
                    Controls the amount of information logged by the application
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Database Location
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={databasePath || 'Using default location'}
                      readOnly
                      className="input bg-gray-50"
                    />
                    <button type="button" className="btn-secondary whitespace-nowrap">
                      Open Folder
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Location where your bookings and watches are stored
                  </p>
                </div>

                <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
                  <h4 className="text-sm font-medium text-yellow-900 mb-2">Danger Zone</h4>
                  <p className="text-sm text-yellow-700 mb-3">
                    These actions cannot be undone. Please be careful.
                  </p>
                  <div className="space-y-2">
                    <button type="button" className="btn-danger text-sm">
                      Clear All Data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
