import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { fail, ok } from '@tests/utils/renderer/createMockApi';
import { makeLocation } from '@tests/fixtures/renderer/watches';
import { politeAnnouncement, renderWithProviders } from '@tests/utils/renderer/renderWithProviders';
import { LocationCombobox, type LocationChoice } from './LocationCombobox';

const OSPREY = makeLocation({ externalId: '20', name: 'Osprey Bay' });
const NINGALOO = makeLocation({
  externalId: '21',
  name: 'Osprey Hill',
  area: { name: 'Ningaloo Marine Park', region: 'Coral Coast' },
});

function Picker({
  onChange = jest.fn(),
  unavailableReason,
}: {
  onChange?: (l: LocationChoice | null) => void;
  unavailableReason?: (location: { bookingMode: string }) => string | undefined;
}) {
  const [value, setValue] = useState<LocationChoice | null>(null);
  return (
    <>
      <LocationCombobox
        providerId="parkstay"
        providerName="ParkStay"
        unavailableReason={unavailableReason}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
      <p>Chosen: {value?.name ?? 'none'}</p>
    </>
  );
}

function catalog(search: jest.Mock, syncing = false) {
  return {
    catalog: {
      search,
      status: jest.fn().mockResolvedValue(
        ok({
          providers: [{ providerId: 'parkstay', count: syncing ? 0 : 6, stale: false, syncing }],
        })
      ),
    },
  };
}

const results = (items = [OSPREY, NINGALOO], total = items.length) =>
  jest.fn().mockResolvedValue(ok({ items, total }));

describe('LocationCombobox', () => {
  it('searches only the chosen provider, from 2 letters and after a pause', async () => {
    const search = results();
    const { user } = renderWithProviders(<Picker />, { api: catalog(search) });
    const input = screen.getByRole('combobox', { name: 'Location' });

    await user.type(input, 'O');
    await new Promise((r) => setTimeout(r, 400));
    expect(search).not.toHaveBeenCalled();
    expect(await screen.findByText('Type at least 2 letters')).toBeInTheDocument();

    await user.type(input, 'sp');
    await waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(search).toHaveBeenCalledWith({
      text: 'Osp',
      providerIds: ['parkstay'],
      limit: 20,
      sort: 'relevance',
    });
    expect(await screen.findByRole('option', { name: /Osprey Bay/ })).toBeInTheDocument();
  });

  it('follows the combobox pattern with Up/Down/Enter/Escape', async () => {
    const onChange = jest.fn();
    const { user } = renderWithProviders(<Picker onChange={onChange} />, {
      api: catalog(results()),
    });
    const input = screen.getByRole('combobox', { name: 'Location' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('aria-controls');

    await user.type(input, 'Osprey');
    await screen.findByRole('option', { name: /Osprey Hill/ });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox').id).toBe(input.getAttribute('aria-controls'));

    await user.keyboard('{ArrowDown}{ArrowDown}');
    const active = input.getAttribute('aria-activedescendant');
    expect(active && document.getElementById(active)).toHaveTextContent('Osprey Hill');
    await user.keyboard('{ArrowUp}');
    expect(
      document.getElementById(input.getAttribute('aria-activedescendant') ?? '')
    ).toHaveTextContent('Osprey Bay');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ externalId: '20', name: 'Osprey Bay' })
    );
    expect(screen.getByText('Chosen: Osprey Bay')).toBeInTheDocument();
    expect(input).toHaveValue('Osprey Bay');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Chosen: Osprey Bay')).toBeInTheDocument();
  });

  it('announces how many locations matched, politely', async () => {
    const { user } = renderWithProviders(<Picker />, { api: catalog(results()) });
    await user.type(screen.getByRole('combobox', { name: 'Location' }), 'Osprey');
    await waitFor(() => expect(politeAnnouncement()).toBe('2 locations'));
  });

  it('says "20 of 57 locations" when more matched than it lists', async () => {
    const { user } = renderWithProviders(<Picker />, {
      api: catalog(results([OSPREY, NINGALOO], 57)),
    });
    await user.type(screen.getByRole('combobox', { name: 'Location' }), 'Bay');
    await waitFor(() => expect(politeAnnouncement()).toBe('2 of 57 locations'));
  });

  it('says No locations match "{q}" when nothing matches', async () => {
    const { user } = renderWithProviders(<Picker />, { api: catalog(results([])) });
    await user.type(screen.getByRole('combobox', { name: 'Location' }), 'zzz');
    expect(
      await screen.findByRole('option', { name: 'No locations match "zzz"' })
    ).toBeInTheDocument();
    await waitFor(() => expect(politeAnnouncement()).toBe('No locations match "zzz"'));
  });

  it('clears the choice when the text changes again', async () => {
    const onChange = jest.fn();
    const { user } = renderWithProviders(<Picker onChange={onChange} />, {
      api: catalog(results()),
    });
    const input = screen.getByRole('combobox', { name: 'Location' });
    await user.type(input, 'Osprey');
    await user.click(await screen.findByRole('option', { name: /Osprey Bay/ }));
    expect(screen.getByText('Chosen: Osprey Bay')).toBeInTheDocument();
    await user.type(input, 'x');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('Chosen: none')).toBeInTheDocument();
  });

  it('shows an inline error with Retry when the search fails', async () => {
    const search = jest
      .fn()
      .mockResolvedValueOnce(fail('The catalogue is unavailable'))
      .mockResolvedValueOnce(fail('The catalogue is unavailable'))
      .mockResolvedValue(ok({ items: [OSPREY], total: 1 }));
    const { user } = renderWithProviders(<Picker />, { api: catalog(search) });
    await user.type(screen.getByRole('combobox', { name: 'Location' }), 'Osprey');
    const retry = await screen.findByRole('button', { name: 'Retry' }, { timeout: 4000 });
    expect(screen.getByText("Locations couldn't be searched")).toBeInTheDocument();
    await user.click(retry);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull());
  });

  it('says the provider’s locations are still loading while its catalogue syncs', async () => {
    renderWithProviders(<Picker />, { api: catalog(results([]), true) });
    expect(
      await screen.findByText(/Locations from ParkStay are still loading/)
    ).toBeInTheDocument();
  });

  it('lists places that cannot be chosen as disabled, with the reason', async () => {
    const onChange = jest.fn();
    const offline = makeLocation({ externalId: '22', name: 'Osprey Hut', bookingMode: 'offline' });
    const { user } = renderWithProviders(
      <Picker
        onChange={onChange}
        unavailableReason={(l) => (l.bookingMode === 'online' ? undefined : 'Not bookable online')}
      />,
      { api: catalog(results([offline, OSPREY])) }
    );
    await user.type(screen.getByRole('combobox', { name: 'Location' }), 'Osprey');
    const hut = await screen.findByRole('option', { name: /Osprey Hut/ });
    expect(hut).toHaveAttribute('aria-disabled', 'true');
    expect(hut).toHaveTextContent('Not bookable online');
    await user.click(hut);
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ externalId: '22' }));
    expect(screen.getByRole('option', { name: /Osprey Bay/ })).not.toHaveAttribute('aria-disabled');
  });
});
