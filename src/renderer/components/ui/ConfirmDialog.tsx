import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, ButtonBase } from './Button';
import { Dialog } from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` (default) uses the solid crimson confirm and focuses Cancel first. */
  tone?: 'danger' | 'primary';
  /** May return a Promise: the confirm button shows loading until it settles. */
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
}

/**
 * "Are you sure?" built on Dialog, as an `alertdialog`. The parent closes it (sets `open`
 * to false) when the action is done; while an async confirm runs, it cannot be dismissed.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const confirm = async () => {
    const result = onConfirm();
    if (!result || typeof (result as Promise<unknown>).then !== 'function') return;
    setBusy(true);
    try {
      await result;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      size="sm"
      role="alertdialog"
      hideCloseButton
      closeOnEsc={!busy}
      closeOnOverlayClick={!busy}
      initialFocusRef={tone === 'danger' ? cancelRef : confirmRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <ButtonBase
            ref={confirmRef}
            variant={tone === 'danger' ? 'danger-solid' : 'primary'}
            loading={busy}
            onClick={confirm}
          >
            {confirmLabel}
          </ButtonBase>
        </>
      }
    />
  );
}

export default ConfirmDialog;
