import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

const renderInRoot = (ui: React.ReactElement) => {
  const root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
  return render(ui, { container: root });
};

describe('ConfirmDialog', () => {
  it('is an alertdialog named by its title, described by its message, and focuses Cancel for danger', () => {
    renderInRoot(
      <ConfirmDialog
        open
        title="Delete watch"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Delete watch' });
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('focuses the confirm button first for the primary tone', () => {
    renderInRoot(
      <ConfirmDialog
        open
        tone="primary"
        title="Arm snipe"
        message="WA Stay will try at midnight."
        confirmLabel="Arm"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Arm' })).toHaveFocus();
  });

  it('shows loading on confirm until an async onConfirm resolves', async () => {
    let resolve: () => void = () => undefined;
    const onConfirm = jest.fn(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        })
    );
    const onCancel = jest.fn();
    renderInRoot(
      <ConfirmDialog
        open
        title="Delete booking"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    const confirm = screen.getByRole('button', { name: 'Delete' });
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();

    await import('@testing-library/react').then(({ act }) =>
      act(async () => {
        resolve();
      })
    );
    expect(confirm).not.toHaveAttribute('aria-busy');
    expect(confirm).toBeEnabled();
  });

  it('calls onCancel from Cancel and Escape, and renders nothing when closed', async () => {
    const onCancel = jest.fn();
    const { rerender } = renderInRoot(
      <ConfirmDialog
        open
        title="Delete"
        message="Sure?"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
    rerender(
      <ConfirmDialog
        open={false}
        title="Delete"
        message="Sure?"
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('a synchronous onConfirm does not show loading', async () => {
    const onConfirm = jest.fn();
    renderInRoot(
      <ConfirmDialog
        open
        title="Delete"
        message="Sure?"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toHaveAttribute('aria-busy');
  });
});
