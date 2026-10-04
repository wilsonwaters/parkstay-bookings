/**
 * QueueStatus reads ParkStay's access gate (`providers.accessStatus('parkstay')` and
 * `provider:access-status` events), never the retired `queue` namespace. Idle shows nothing.
 */

import { act, render, screen } from '@testing-library/react';
import type { AccessStatus } from '../../shared/types/provider.types';
import { createMockApi, ok, type MockApi } from '../../../tests/utils/renderer/createMockApi';
import QueueStatus from './QueueStatus';

const status = (state: AccessStatus['state'], extra: Partial<AccessStatus> = {}): AccessStatus => ({
  providerId: 'parkstay',
  state,
  updatedAt: '2026-10-02T02:00:00.000Z',
  ...extra,
});

function renderWith(initial: AccessStatus): MockApi {
  const mock = createMockApi({
    providers: { accessStatus: jest.fn().mockResolvedValue(ok(initial)) },
  });
  Object.defineProperty(window, 'api', { value: mock.api, configurable: true, writable: true });
  render(<QueueStatus />);
  return mock;
}

/** Lets the first `accessStatus` answer land. */
const settle = () => act(async () => {});

describe('QueueStatus', () => {
  it("asks for ParkStay's gate and shows nothing while it is idle", async () => {
    const mock = renderWith(status('idle'));
    await settle();
    expect(mock.api.providers.accessStatus).toHaveBeenCalledWith('parkstay');
    expect(screen.queryByText('Queue Status')).toBeNull();
    expect(mock.subscriberCount('provider:access-status')).toBe(1);
  });

  it('shows the place in the queue and the wait while waiting', async () => {
    renderWith(status('waiting', { position: 37, etaSeconds: 180 }));
    expect(await screen.findByText('In Queue')).toBeTruthy();
    expect(screen.getByText('#37')).toBeTruthy();
    expect(screen.getByText('~3 min')).toBeTruthy();
  });

  it('follows provider:access-status events for ParkStay only', async () => {
    const mock = renderWith(status('idle'));
    await settle();
    mock.emit('provider:access-status', status('waiting', { position: 5 }));
    expect(await screen.findByText('#5')).toBeTruthy();

    mock.emit('provider:access-status', { ...status('error'), providerId: 'other' });
    expect(screen.getByText('#5')).toBeTruthy();

    mock.emit(
      'provider:access-status',
      status('active', { expiresAt: new Date(Date.now() + 125_000).toISOString() })
    );
    expect(await screen.findByText('Active')).toBeTruthy();
    expect(screen.getByText(/^2m \d\ds$/)).toBeTruthy();

    mock.emit('provider:access-status', status('idle'));
    expect(screen.queryByText('Queue Status')).toBeNull();
  });
});
