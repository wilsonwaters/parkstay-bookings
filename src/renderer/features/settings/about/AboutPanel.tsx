import type { ReactNode } from 'react';
import { FolderOpen } from 'lucide-react';
import { APP_DESCRIPTION, APP_ISSUES_URL, APP_REPO_URL } from '@shared/constants';
import { useAppInfo, useOpenLogsFolder } from '../../../api';
import { ExternalLink } from '../../../components/ExternalLink';
import { Button, Notice, Spinner } from '../../../components/ui';

export interface AboutPanelProps {
  /**
   * More actions, after GitHub, Report an issue and Open logs folder in the same row: Settings
   * → About adds its update check here.
   */
  actions?: ReactNode;
  /** More content under the actions, above the licence line (a result message, a Notice). */
  children?: ReactNode;
}

/**
 * About WA Stay: the version, what the app is, the runtime details, where to get help and the
 * logs folder. The single source for About content (master plan, shared building blocks): the
 * account menu's About dialog wraps it, and Settings → About renders it with its own `actions`
 * and `children`. It has no heading of its own, so it fits under either one.
 */
export function AboutPanel({ actions, children }: AboutPanelProps) {
  const info = useAppInfo();
  const openLogs = useOpenLogsFolder();

  return (
    <div>
      <div className="text-center">
        {info.data && (
          <p className="text-base font-semibold tabular-nums text-fg">
            Version {info.data.version}
          </p>
        )}
        <p className="mt-1 text-sm text-fg-secondary">{APP_DESCRIPTION}</p>
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

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
        <ExternalLink href={APP_REPO_URL}>GitHub</ExternalLink>
        <ExternalLink href={APP_ISSUES_URL}>Report an issue</ExternalLink>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<FolderOpen size={16} aria-hidden="true" />}
          onClick={() => openLogs.mutate()}
        >
          Open logs folder
        </Button>
        {actions}
      </div>
      {openLogs.error && (
        <Notice tone="danger" className="mt-3">
          {openLogs.error.message}
        </Notice>
      )}
      {children && <div className="mt-4">{children}</div>}

      <p className="mt-4 text-center text-xs text-fg-muted">MIT License</p>
    </div>
  );
}

export default AboutPanel;
