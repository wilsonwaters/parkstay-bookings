/**
 * SMTP Setup Instructions Component
 * Displays setup guides for Gmail and Outlook app passwords
 */

import React, { useState } from 'react';
import { SMTPPreset } from '@shared/types';

interface SMTPSetupInstructionsProps {
  preset: SMTPPreset;
}

const SMTPSetupInstructions: React.FC<SMTPSetupInstructionsProps> = ({ preset }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (preset === SMTPPreset.CUSTOM) {
    return (
      <div className="mt-4 rounded-md bg-gray-50 p-4 border border-gray-200">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Custom SMTP Server</h4>
        <p className="text-sm text-gray-600">
          Enter your SMTP server details. Contact your email provider for the correct host, port,
          and security settings.
        </p>
      </div>
    );
  }

  const instructions =
    preset === SMTPPreset.GMAIL ? getGmailInstructions() : getOutlookInstructions();

  return (
    <div className="mt-4 rounded-md bg-blue-50 border border-blue-200">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center space-x-2">
          <span className="text-blue-600">
            {preset === SMTPPreset.GMAIL ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
              </svg>
            )}
          </span>
          <span className="text-sm font-medium text-blue-900">
            How to set up {preset === SMTPPreset.GMAIL ? 'Gmail' : 'Outlook'} App Password
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-blue-600 transform transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4">
          <ol className="list-decimal list-inside space-y-3 text-sm text-blue-800">
            {instructions.steps.map((step, index) => (
              <li key={index} className="leading-relaxed">
                {step.text}
                {step.link && (
                  <a
                    href={step.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-blue-600 hover:text-blue-800 underline"
                  >
                    {step.link.text}
                  </a>
                )}
              </li>
            ))}
          </ol>

          {instructions.notes && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> {instructions.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface InstructionStep {
  text: string;
  link?: {
    url: string;
    text: string;
  };
}

interface Instructions {
  steps: InstructionStep[];
  notes?: string;
}

function getGmailInstructions(): Instructions {
  return {
    steps: [
      {
        text: 'Go to your Google Account settings at',
        link: {
          url: 'https://myaccount.google.com',
          text: 'myaccount.google.com',
        },
      },
      {
        text: 'Navigate to Security in the left sidebar',
      },
      {
        text: 'Under "How you sign in to Google", make sure 2-Step Verification is enabled. If not, set it up first.',
      },
      {
        text: 'Once 2-Step Verification is on, go back to Security and scroll down to find "App passwords" (you may need to sign in again)',
      },
      {
        text: 'Click "App passwords" and select "Mail" for the app and "Windows Computer" for the device',
      },
      {
        text: 'Click "Generate" to create a 16-character app password',
      },
      {
        text: 'Copy the generated password (shown with spaces, but you can paste it with or without spaces) and use it in the App Password field above',
      },
    ],
    notes:
      'App passwords are only available when 2-Step Verification is enabled. The app password is shown only once, so save it securely.',
  };
}

function getOutlookInstructions(): Instructions {
  return {
    steps: [
      {
        text: 'Go to your Microsoft Account security settings at',
        link: {
          url: 'https://account.microsoft.com/security',
          text: 'account.microsoft.com/security',
        },
      },
      {
        text: 'Sign in if prompted and navigate to "Advanced security options"',
      },
      {
        text: 'Make sure Two-step verification is turned ON. If not, set it up first.',
      },
      {
        text: 'Scroll down to "App passwords" section',
      },
      {
        text: 'Click "Create a new app password"',
      },
      {
        text: "Microsoft will generate a password for you. Copy it immediately as it won't be shown again.",
      },
      {
        text: 'Use this generated password in the App Password field above',
      },
    ],
    notes:
      "If you don't see the App passwords option, your organization may have disabled it. Contact your IT administrator.",
  };
}

export default SMTPSetupInstructions;
