import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Popover } from './Popover';

function Filters() {
  return (
    <>
      <Popover label="Price filter" trigger={<Button variant="secondary">Price</Button>}>
        {({ close }) => (
          <>
            <label>
              Max price <input type="number" />
            </label>
            <Button onClick={close}>Apply</Button>
          </>
        )}
      </Popover>
      <button type="button">Elsewhere</button>
    </>
  );
}

const trigger = () => screen.getByRole('button', { name: 'Price' });

describe('Popover', () => {
  it('is a non-modal dialog tied to its trigger, and focus moves in on open', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    render(<Filters />, { container: root });
    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger());
    const popover = screen.getByRole('dialog', { name: 'Price filter' });
    expect(popover).not.toHaveAttribute('aria-modal');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', popover.id);
    expect(screen.getByRole('spinbutton', { name: 'Max price' })).toHaveFocus();
    expect(root).not.toHaveAttribute('inert');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<Filters />);
    await userEvent.click(trigger());
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('closes on an outside click', async () => {
    render(<Filters />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes from inside with the close function, and when Tab leaves either end', async () => {
    const user = userEvent.setup();
    render(<Filters />);
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Apply' })).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });
});
