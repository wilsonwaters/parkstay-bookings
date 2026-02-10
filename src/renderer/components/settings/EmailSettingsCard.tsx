/**
 * Email Settings Card Component
 * Configuration UI for SMTP email notifications
 */

import React, { useState, useEffect } from 'react';
import {
  NotificationChannel,
  SMTPPreset,
  SMTPConfig,
  ProviderStatus,
  SMTP_PRESETS,
  NotificationProvider,
} from '@shared/types';
import SMTPSetupInstructions from './SMTPSetupInstructions';

interface EmailSettingsCardProps {
  onSaveSuccess?: () => void;
}

const EmailSettingsCard: React.FC<EmailSettingsCardProps> = ({ onSaveSuccess }) => {
  // Form state
  const [enabled, setEnabled] = useState(false);
  const [preset, setPreset] = useState<SMTPPreset>(SMTPPreset.GMAIL);
  const [email, setEmail] = useState(''); // For Gmail/Outlook: email = username. For Custom: this is fromEmail
  const [appPassword, setAppPassword] = useState('');
  const [toEmail, setToEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Custom SMTP fields
  const [customHost, setCustomHost] = useState('');
  const [customPort, setCustomPort] = useState(587);
  const [customSecure, setCustomSecure] = useState(false);
  const [customUsername, setCustomUsername] = useState(''); // Separate username for custom SMTP
  const [customFromEmail, setCustomFromEmail] = useState(''); // Sender email for custom SMTP

  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>(
    ProviderStatus.NOT_CONFIGURED
  );
  const [lastTestedAt, setLastTestedAt] = useState<Date | null>(null);

  useEffect(() => {
    loadProviderConfig();
  }, []);

  const loadProviderConfig = async () => {
    try {
      setIsLoading(true);
      setError('');

      const response = await window.api.notificationProvider.get(NotificationChannel.EMAIL_SMTP);

      if (response.success && response.data) {
        const provider = response.data as NotificationProvider;
        const config = provider.config as SMTPConfig;

        setEnabled(provider.enabled);
        setProviderStatus(provider.status);
        setLastTestedAt(provider.lastTestedAt ? new Date(provider.lastTestedAt) : null);

        if (config) {
          setPreset(config.preset || SMTPPreset.GMAIL);
          setToEmail(config.toEmail || '');
          // Don't load password for security - user must re-enter

          if (config.preset === SMTPPreset.CUSTOM) {
            setCustomHost(config.host || '');
            setCustomPort(config.port || 587);
            setCustomSecure(config.secure || false);
            setCustomUsername(config.auth?.user || '');
            setCustomFromEmail(config.fromEmail || '');
            setEmail(''); // Not used for custom
          } else {
            // Gmail/Outlook: email = username
            setEmail(config.auth?.user || '');
          }
        }
      }
    } catch (err: any) {
      console.error('Error loading email provider config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const buildConfig = (): SMTPConfig => {
    const presetConfig = SMTP_PRESETS[preset];

    if (preset === SMTPPreset.CUSTOM) {
      const senderEmail = customFromEmail || customUsername;
      return {
        preset,
        host: customHost,
        port: customPort,
        secure: customSecure,
        auth: {
          user: customUsername,
          pass: appPassword,
        },
        fromEmail: customFromEmail || undefined,
        toEmail: toEmail || senderEmail,
      };
    }

    return {
      preset,
      host: presetConfig.host,
      port: presetConfig.port,
      secure: presetConfig.secure,
      auth: {
        user: email,
        pass: appPassword,
      },
      toEmail: toEmail || email,
    };
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    // Validation
    if (preset === SMTPPreset.CUSTOM) {
      if (!customUsername) {
        setError('Username is required');
        return;
      }
      if (!customHost) {
        setError('SMTP host is required');
        return;
      }
    } else {
      if (!email) {
        setError('Email address is required');
        return;
      }
    }

    if (!appPassword) {
      setError('Password is required');
      return;
    }

    try {
      setIsSaving(true);

      const response = await window.api.notificationProvider.configure({
        channel: NotificationChannel.EMAIL_SMTP,
        displayName: 'Email (SMTP)',
        enabled,
        config: buildConfig(),
      });

      if (response.success) {
        setSuccessMessage('Email settings saved successfully');
        setProviderStatus(ProviderStatus.CONFIGURED);
        setAppPassword(''); // Clear password after save
        onSaveSuccess?.();
      } else {
        setError(response.error || 'Failed to save email settings');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    setError('');
    setSuccessMessage('');

    // Need to save first if password is entered
    if (appPassword) {
      setError('Please save your settings before testing');
      return;
    }

    try {
      setIsTesting(true);

      const response = await window.api.notificationProvider.test(NotificationChannel.EMAIL_SMTP);

      if (response.success && response.data) {
        if (response.data.success) {
          setSuccessMessage(response.data.message || 'Test email sent successfully!');
          setProviderStatus(ProviderStatus.CONFIGURED);
          setLastTestedAt(new Date());
        } else {
          setError(response.data.error || 'Test failed');
          setProviderStatus(ProviderStatus.ERROR);
        }
      } else {
        setError(response.error || 'Failed to test email connection');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleEnabled = async (newEnabled: boolean) => {
    setEnabled(newEnabled);

    // If already configured, update enabled state in database
    if (providerStatus !== ProviderStatus.NOT_CONFIGURED) {
      try {
        if (newEnabled) {
          await window.api.notificationProvider.enable(NotificationChannel.EMAIL_SMTP);
        } else {
          await window.api.notificationProvider.disable(NotificationChannel.EMAIL_SMTP);
        }
      } catch (err) {
        console.error('Error toggling provider:', err);
      }
    }
  };

  const getStatusBadge = () => {
    switch (providerStatus) {
      case ProviderStatus.CONFIGURED:
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            Configured
          </span>
        );
      case ProviderStatus.ERROR:
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
            Error
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
            Not Configured
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-48"></div>
        <div className="h-10 bg-gray-200 rounded"></div>
        <div className="h-10 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Email Notifications</h3>
          <p className="text-sm text-gray-600">
            Receive email notifications when availability is found
          </p>
        </div>
        {getStatusBadge()}
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="emailEnabled"
            checked={enabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="emailEnabled">
            <span className="font-medium text-gray-900">Enable Email Notifications</span>
            <p className="text-sm text-gray-500">
              Send emails through your own SMTP server (Gmail, Outlook, etc.)
            </p>
          </label>
        </div>
      </div>

      {/* Configuration form */}
      {enabled && (
        <form onSubmit={handleSave} className="space-y-4">
          {/* Provider preset selection */}
          <div>
            <label htmlFor="preset" className="block text-sm font-medium text-gray-700 mb-1">
              Email Provider
            </label>
            <select
              id="preset"
              value={preset}
              onChange={(e) => setPreset(e.target.value as SMTPPreset)}
              className="input"
            >
              <option value={SMTPPreset.GMAIL}>Gmail</option>
              <option value={SMTPPreset.OUTLOOK}>Outlook / Microsoft 365</option>
              <option value={SMTPPreset.CUSTOM}>Custom SMTP Server</option>
            </select>
          </div>

          {/* Custom SMTP fields */}
          {preset === SMTPPreset.CUSTOM && (
            <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <h4 className="text-sm font-medium text-gray-900">Server Settings</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="customHost" className="block text-sm font-medium text-gray-700 mb-1">
                    SMTP Host
                  </label>
                  <input
                    id="customHost"
                    type="text"
                    value={customHost}
                    onChange={(e) => setCustomHost(e.target.value)}
                    className="input"
                    placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <label htmlFor="customPort" className="block text-sm font-medium text-gray-700 mb-1">
                    Port
                  </label>
                  <input
                    id="customPort"
                    type="number"
                    value={customPort}
                    onChange={(e) => setCustomPort(parseInt(e.target.value) || 587)}
                    className="input"
                    min="1"
                    max="65535"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="customSecure"
                  checked={customSecure}
                  onChange={(e) => setCustomSecure(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="customSecure" className="text-sm text-gray-700">
                  Use SSL/TLS (port 465). Leave unchecked for STARTTLS (port 587).
                </label>
              </div>

              <h4 className="text-sm font-medium text-gray-900 pt-2">Authentication</h4>
              <div>
                <label htmlFor="customUsername" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  id="customUsername"
                  type="text"
                  value={customUsername}
                  onChange={(e) => setCustomUsername(e.target.value)}
                  className="input"
                  placeholder="username or email"
                />
              </div>

              <div>
                <label htmlFor="customFromEmail" className="block text-sm font-medium text-gray-700 mb-1">
                  From Email Address (Optional)
                </label>
                <input
                  id="customFromEmail"
                  type="email"
                  value={customFromEmail}
                  onChange={(e) => setCustomFromEmail(e.target.value)}
                  className="input"
                  placeholder={customUsername || 'sender@example.com'}
                />
                <p className="mt-1 text-xs text-gray-500">
                  The email address shown as sender. Defaults to username if not set.
                </p>
              </div>
            </div>
          )}

          {/* Email address - only for Gmail/Outlook presets */}
          {preset !== SMTPPreset.CUSTOM && (
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
                placeholder="your.email@gmail.com"
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                This is the email you&apos;ll send notifications from
              </p>
            </div>
          )}

          {/* Password */}
          <div>
            <label htmlFor="appPassword" className="block text-sm font-medium text-gray-700 mb-1">
              {preset === SMTPPreset.CUSTOM ? 'Password' : 'App Password'}
            </label>
            <div className="relative">
              <input
                id="appPassword"
                type={showPassword ? 'text' : 'password'}
                value={appPassword}
                onChange={(e) => setAppPassword(e.target.value)}
                className="input pr-10"
                placeholder={preset === SMTPPreset.CUSTOM ? 'Enter your password' : 'Enter your app password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {providerStatus === ProviderStatus.CONFIGURED
                ? 'Leave blank to keep existing password, or enter a new one to update'
                : preset === SMTPPreset.CUSTOM
                  ? 'Your SMTP server password'
                  : 'Create an app password (not your regular password)'}
            </p>
          </div>

          {/* Setup instructions */}
          <SMTPSetupInstructions preset={preset} />

          {/* Recipient email (optional) */}
          <div>
            <label htmlFor="toEmail" className="block text-sm font-medium text-gray-700 mb-1">
              Notification Recipient (Optional)
            </label>
            <input
              id="toEmail"
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="input"
              placeholder={email || 'Same as sender email'}
            />
            <p className="mt-1 text-xs text-gray-500">
              Where to send notifications. Defaults to your email address.
            </p>
          </div>

          {/* Messages */}
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

          {/* Security notice */}
          <div className="rounded-md bg-blue-50 p-4 border border-blue-200">
            <p className="text-sm text-blue-800">
              Your app password is encrypted and stored securely on your device.
              It is never sent to any third-party servers.
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting || providerStatus === ProviderStatus.NOT_CONFIGURED}
              className="btn-secondary"
            >
              {isTesting ? 'Sending...' : 'Send Test Email'}
            </button>
          </div>

          {/* Last tested info */}
          {lastTestedAt && (
            <p className="text-xs text-gray-500">
              Last tested: {lastTestedAt.toLocaleString()}
            </p>
          )}
        </form>
      )}
    </div>
  );
};

export default EmailSettingsCard;
