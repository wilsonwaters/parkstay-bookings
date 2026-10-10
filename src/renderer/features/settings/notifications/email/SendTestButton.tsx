import { useState } from 'react';
import { Send } from 'lucide-react';
import { useTestEmailNotifier } from '../../../../api';
import { Button } from '../../../../components/ui';
import { cx } from '../../../../components/ui/cx';

export interface SendTestButtonProps {
  /** Unsaved changes: "Save and send test", which runs `save` first (false: not saved). */
  save?: () => Promise<boolean>;
  /** Where the test goes, for the success message. */
  recipient: string;
  disabled?: boolean;
}

type Result = { ok: true; message: string } | { ok: false; message: string };

/**
 * Sends a test email with the saved settings. The result is read out from a polite live
 * region that is always rendered, so the change is announced.
 */
export function SendTestButton({ save, recipient, disabled }: SendTestButtonProps) {
  const test = useTestEmailNotifier();
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setResult(null);
    if (save) {
      setSaving(true);
      const saved = await save().finally(() => setSaving(false));
      if (!saved) return;
    }
    try {
      const outcome = await test.mutateAsync();
      setResult(
        outcome.success
          ? { ok: true, message: `Test email sent to ${recipient}. Check your inbox.` }
          : {
              ok: false,
              message: `The test email couldn't be sent: ${outcome.error || outcome.message}`,
            }
      );
    } catch (error) {
      setResult({
        ok: false,
        message: `The test email couldn't be sent: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="secondary"
          leadingIcon={<Send size={16} aria-hidden="true" />}
          loading={saving || test.isPending}
          disabled={disabled}
          onClick={() => void run()}
        >
          {save ? 'Save and send test' : 'Send test email'}
        </Button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={cx('text-sm', result?.ok === false ? 'text-danger' : 'text-fg-secondary')}
      >
        {result?.message}
      </p>
    </div>
  );
}

export default SendTestButton;
