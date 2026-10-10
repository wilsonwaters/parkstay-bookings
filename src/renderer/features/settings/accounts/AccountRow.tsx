import { CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';
import { useAccountCheck } from '../../../api';
import type { ProviderAccount, ProviderManifest } from '../../../../shared/types/provider.types';
import { Button, Disclosure, Notice, ProviderBadge } from '../../../components/ui';
import { cx } from '../../../components/ui/cx';
import {
  ACTION_LABELS,
  accountPurpose,
  accountRowText,
  missingAccountWarning,
  type AccountAction,
} from './accountText';
import { SignInLinkField } from './SignInLinkField';

/** How the row's last sign-in ended, when it needs saying. */
export type SignInOutcome = { kind: 'incomplete' } | { kind: 'error'; message: string };

export interface AccountRowProps {
  manifest: ProviderManifest;
  account: ProviderAccount | undefined;
  /** This row's sign-in window is open. */
  pending: boolean;
  /** Another row's sign-in is open: one at a time. */
  blocked: boolean;
  outcome?: SignInOutcome;
  onAction(action: AccountAction): void;
  /** The row's action button, or its name when it has none (focus target). */
  focusRef: (element: HTMLElement | null) => void;
}

const STATUS_ICON = {
  'signed-in': CircleCheck,
  neutral: CircleDashed,
  warning: TriangleAlert,
} as const;

const STATUS_CLASS = {
  'signed-in': 'text-available-fg',
  neutral: 'text-fg-secondary',
  warning: 'text-warning-fg',
} as const;

/** One provider on Settings → Accounts (§12.9: shown even when there is only one). */
export function AccountRow({
  manifest,
  account,
  pending,
  blocked,
  outcome,
  onAction,
  focusRef,
}: AccountRowProps) {
  const hasAccount = manifest.capabilities.account !== 'none';
  // Is the stored status still true? One read-only check per visit (main caches it 60 s)
  useAccountCheck(manifest.id, { enabled: hasAccount });

  const text = accountRowText(manifest, account);
  const warning = missingAccountWarning(manifest, account);
  const StatusIcon = STATUS_ICON[text.tone];
  const statusId = `account-${manifest.id}-status`;

  return (
    <li id={`account-${manifest.id}`} className="flex flex-col gap-4 py-6 sm:flex-row sm:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3
          ref={text.action ? undefined : focusRef}
          tabIndex={text.action ? undefined : -1}
          className="text-base"
        >
          <ProviderBadge providerId={manifest.id} />
        </h3>
        <p
          id={statusId}
          className={cx('flex items-center gap-1.5 text-sm font-medium', STATUS_CLASS[text.tone])}
        >
          <StatusIcon size={16} aria-hidden="true" className="shrink-0" />
          {text.status}
        </p>
        {text.meta && <p className="text-xs text-fg-muted">{text.meta}</p>}
        <p className="max-w-prose text-sm text-fg-secondary">{accountPurpose(manifest)}</p>
        {warning && <p className="text-sm font-medium text-warning-fg">{warning}</p>}
        {outcome?.kind === 'incomplete' && (
          <p className="text-sm text-fg-muted">Sign-in wasn&apos;t completed.</p>
        )}
        {outcome?.kind === 'error' && (
          <Notice
            tone="danger"
            className="mt-2"
            actions={
              <Button
                variant="secondary"
                size="sm"
                disabled={blocked}
                onClick={() => onAction(text.action ?? 'connect')}
              >
                Retry
              </Button>
            }
          >
            {outcome.message}
          </Notice>
        )}
        {hasAccount && account?.status !== 'signed-in' && (
          <Disclosure summary="Have a sign-in link?" className="mt-2">
            <div className="pt-3">
              <SignInLinkField manifest={manifest} />
            </div>
          </Disclosure>
        )}
      </div>
      {text.action && (
        <div className="shrink-0">
          <Button
            ref={focusRef}
            variant="secondary"
            loading={pending}
            disabled={blocked}
            aria-describedby={statusId}
            onClick={() => text.action && onAction(text.action)}
          >
            {pending ? 'Waiting for sign-in…' : ACTION_LABELS[text.action]}
          </Button>
        </div>
      )}
    </li>
  );
}

export default AccountRow;
