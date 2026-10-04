/**
 * About WA Stay: version, runtime details and where to get help. Re-hosted in the D2 Dialog by
 * D3; U5 rebuilds its content.
 */

import { useRef } from 'react';
import { ExternalLink, FolderOpen } from 'lucide-react';
import { APP_ISSUES_URL, APP_NAME, APP_REPO_URL } from '@shared/constants';
import { useAppInfo, useOpenLogsFolder } from '../api';
import { Logo } from './brand/Logo';
import { Button, Dialog, Notice, Spinner } from './ui';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const info = useAppInfo({ enabled: isOpen });
  const openLogs = useOpenLogsFolder();
  const doneRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title={`About ${APP_NAME}`}
      size="sm"
      initialFocusRef={doneRef}
      footer={
        <Button ref={doneRef} variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col items-center text-center">
        <Logo variant="lockup" decorative className="h-10 w-auto" />
        {info.data && (
          <p className="mt-3 text-base font-semibold tabular-nums text-fg">
            Version {info.data.version}
          </p>
        )}
        <p className="mt-1 text-sm text-fg-secondary">
          Automated campground booking for Western Australia
        </p>
      </div>

      {info.isLoading && (
        <div className="flex justify-center py-4">
          <Spinner label="Loading app details" />
        </div>
      )}
      {info.error && (
        <Notice tone="danger" className="mt-4">
          {info.error.message}
        </Notice>
      )}
      {info.data && (
        <dl className="mt-4 space-y-1.5 rounded-lg bg-surface-subtle p-3 text-sm">
          {[
            ['Electron', info.data.electronVersion],
            ['Chrome', info.data.chromeVersion],
            ['Node.js', info.data.nodeVersion],
            ['OS', `${info.data.os} (${info.data.arch})`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-fg-secondary">{label}</dt>
              <dd className="text-right tabular-nums text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button
          as="a"
          href={APP_REPO_URL}
          target="_blank"
          rel="noreferrer"
          variant="ghost"
          size="sm"
          trailingIcon={<ExternalLink size={16} aria-hidden="true" />}
        >
          GitHub
        </Button>
        <Button
          as="a"
          href={APP_ISSUES_URL}
          target="_blank"
          rel="noreferrer"
          variant="ghost"
          size="sm"
          trailingIcon={<ExternalLink size={16} aria-hidden="true" />}
        >
          Report an issue
        </Button>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<FolderOpen size={16} aria-hidden="true" />}
          onClick={() => openLogs.mutate()}
        >
          Open logs folder
        </Button>
      </div>
      {openLogs.error && (
        <Notice tone="danger" className="mt-3">
          {openLogs.error.message}
        </Notice>
      )}

      <p className="mt-4 text-center text-xs text-fg-muted">MIT License</p>
    </Dialog>
  );
}
