import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { availabilityFor } from '../../../tests/fixtures/catalog/place-detail';
import { NightGrid } from './NightGrid';

const SITE = { one: 'site', many: 'sites' };
const STAY = { arrival: '2026-11-06', departure: '2026-11-08', adults: 2 };

function renderGrid(shape = {}, stay = STAY) {
  const { units } = availabilityFor(stay, shape);
  return render(
    <NightGrid units={units} arrival={stay.arrival} departure={stay.departure} unitNoun={SITE} />
  );
}

const rowNames = () =>
  within(screen.getByRole('table'))
    .getAllByRole('rowheader')
    .map((cell) => cell.textContent);

describe('NightGrid', () => {
  it('is a real table: a caption, a column per night (never check-out) and a row per site', () => {
    renderGrid({ fully: 3 });
    const table = screen.getByRole('table', { name: 'Availability by night, 6–8 Nov' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Site', 'Fri 6 Nov', 'Sat 7']);
    expect(headers.every((h) => h.getAttribute('scope') === 'col')).toBe(true);
    const rows = within(table).getAllByRole('rowheader');
    expect(rows).toHaveLength(3);
    expect(rows.every((h) => h.getAttribute('scope') === 'row')).toBe(true);
    // The table scrolls sideways from the keyboard: its region is focusable and named.
    expect(screen.getByRole('region', { name: 'Availability by night, 6–8 Nov' })).toHaveAttribute(
      'tabindex',
      '0'
    );
  });

  it("says each cell's state in words, with the price per night", () => {
    renderGrid({ fully: 1, partly: 1, rest: 'booked', price: 30 });
    const row = (name: string) =>
      screen.getByRole('rowheader', { name: new RegExp(`^${name}`) }).closest('tr')!;
    expect(
      within(row('Site 01'))
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['$30Available, $30', '$30Available, $30']);
    // Only fully available sites show by default; the cells of a partly free one say so.
    expect(screen.queryByRole('rowheader', { name: /Site 02/ })).not.toBeInTheDocument();
  });

  it('summarises the stay, and the switch shows partly available sites too', async () => {
    const user = userEvent.setup();
    renderGrid({ fully: 8, partly: 4 });
    expect(screen.getByText('8 of 24 sites free for all 2 nights')).toBeInTheDocument();
    const fullyOnly = screen.getByRole('switch', { name: 'Fully available only' });
    expect(fullyOnly).toBeChecked();
    expect(rowNames()).toHaveLength(8);

    await user.click(fullyOnly);
    expect(fullyOnly).not.toBeChecked();
    // The first 10 of all 24, partly available Site 09 among them.
    expect(rowNames()).toHaveLength(10);
    const partly = screen.getByRole('rowheader', { name: /Site 09/ }).closest('tr')!;
    expect(
      within(partly)
        .getAllByRole('cell')
        .map((c) => c.textContent)
    ).toEqual(['$30Available, $30', 'Booked']);
  });

  it('shows the first 10 rows, then all of them', async () => {
    const user = userEvent.setup();
    renderGrid({ fully: 14 });
    expect(rowNames()).toHaveLength(10);
    const more = screen.getByRole('button', { name: 'Show all 14 sites' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(rowNames()).toHaveLength(14);
    expect(more).toHaveTextContent('Show fewer sites');
    expect(more).toHaveFocus();
  });

  it('says why "Fully available only" shows nothing', () => {
    renderGrid({ fully: 0, partly: 2 });
    expect(screen.getByText('0 of 24 sites free for all 2 nights')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/Turn off "Fully available only"/)).toBeInTheDocument();
  });

  it('labels nights not released yet as such, not as booked', () => {
    renderGrid({ fully: 0, partly: 0, rest: 'not-released' });
    expect(screen.getByText('No sites are free on any of these nights.')).toBeInTheDocument();
  });

  it('keeps a long stay to one column per night, scrolling sideways', async () => {
    const user = userEvent.setup();
    const long = { arrival: '2026-11-06', departure: '2026-12-06', adults: 2 };
    renderGrid({ fully: 2 }, long);
    expect(screen.getAllByRole('columnheader')).toHaveLength(31);
    expect(screen.getByRole('columnheader', { name: 'Tue 1 Dec' })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Fully available only' }));
    expect(screen.getByText('2 of 24 sites free for all 30 nights')).toBeInTheDocument();
  });

  it('has a key to the icons, for the states on screen', async () => {
    const user = userEvent.setup();
    renderGrid({ fully: 2, rest: 'closed' });
    const key = () => within(screen.getByRole('list', { name: 'Key' })).getAllByRole('listitem');
    expect(key().map((item) => item.textContent)).toEqual(['Available']);
    await user.click(screen.getByRole('switch', { name: 'Fully available only' }));
    expect(key().map((item) => item.textContent)).toEqual(['Available', 'Closed']);
  });
});
