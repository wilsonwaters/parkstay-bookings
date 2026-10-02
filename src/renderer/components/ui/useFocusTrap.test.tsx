import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getTabbables, useFocusTrap } from './useFocusTrap';

function Trap({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, { active });
  return (
    <>
      <button type="button" onClick={() => setActive(true)}>
        Open
      </button>
      <div ref={ref} tabIndex={-1} hidden={!active}>
        {children}
        <button type="button" onClick={() => setActive(false)}>
          Done
        </button>
      </div>
      <button type="button">Outside</button>
    </>
  );
}

describe('useFocusTrap', () => {
  it('moves focus in, cycles Tab and Shift+Tab inside, and returns focus on deactivation', async () => {
    const user = userEvent.setup();
    render(
      <Trap>
        <input aria-label="First" />
        <button type="button" disabled>
          Disabled
        </button>
        <span tabIndex={-1}>Not tabbable</span>
      </Trap>
    );
    const open = screen.getByRole('button', { name: 'Open' });
    await user.click(open);
    const first = screen.getByRole('textbox', { name: 'First' });
    const done = screen.getByRole('button', { name: 'Done' });
    expect(first).toHaveFocus();

    await user.tab();
    expect(done).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(done).toHaveFocus();

    await user.click(done);
    expect(open).toHaveFocus();
  });

  it('treats a radio group as one tab stop: the checked radio, else the first', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <input type="radio" name="kind" value="a" />
      <input type="radio" name="kind" value="b" checked />
      <input type="radio" name="size" value="s" />
      <input type="radio" name="size" value="m" />
      <a href="#x">Link</a>
      <div hidden><button>Hidden</button></div>
      <button tabindex="-1">Skipped</button>
    `;
    const values = getTabbables(container).map(
      (el) => (el as HTMLInputElement).value || el.textContent
    );
    expect(values).toEqual(['b', 's', 'Link']);
  });
});
