import { render, screen, within } from '@testing-library/react';
import { SnipeStatus } from '../../../../shared/types/common.types';
import { makeHeldSnipe, makeSnipe } from '@tests/fixtures/renderer/snipes';
import { SnipeTimeline } from './SnipeTimeline';

const items = () => within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem');

describe('SnipeTimeline', () => {
  it('is an ordered list with the current step marked, each state in words', () => {
    render(
      <SnipeTimeline snipe={makeSnipe({ status: SnipeStatus.SNIPING, accessGateEnabled: true })} />
    );
    const list = screen.getByRole('list', { name: 'Progress' });
    expect(list.tagName).toBe('OL');
    expect(items().map((li) => li.textContent)).toEqual([
      'ArmedDonedone',
      'QueueingDonedone',
      'Waiting for releaseDonedone',
      'SnipingNowcurrent step',
      'HeldNot yetnot yet',
    ]);
    expect(items()[3]).toHaveAttribute('aria-current', 'step');
    expect(items().filter((li) => li.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('leaves the queue out when the snipe does not use it, compactly on a card', () => {
    render(<SnipeTimeline snipe={makeHeldSnipe()} compact />);
    expect(items().map((li) => li.textContent?.replace('›', ''))).toEqual([
      'Armed, done',
      'Waiting for release, done',
      'Sniping, done',
      'Held, current step',
    ]);
  });

  it('ends a failed snipe on a terminal step', () => {
    render(
      <SnipeTimeline snipe={makeSnipe({ status: SnipeStatus.FAILED, isActive: false })} compact />
    );
    const last = items().at(-1);
    expect(last).toHaveTextContent('Failed, current step');
    expect(last).toHaveAttribute('aria-current', 'step');
    expect(items()[1]).toHaveTextContent('Waiting for release, not reached');
  });
});
