import { act, render, screen } from '@testing-library/react';
import { useNow } from './useNow';

function Clock({ label }: { label: string }) {
  const now = useNow(60_000);
  return <p>{`${label} ${now.toISOString()}`}</p>;
}

describe('useNow', () => {
  afterEach(() => jest.useRealTimers());

  it('ticks every interval from one shared timer, and stops when nothing listens', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-09T07:00:00Z'));
    const setInterval = jest.spyOn(global, 'setInterval');
    const { unmount } = render(
      <>
        <Clock label="a" />
        <Clock label="b" />
      </>
    );
    expect(screen.getByText('a 2026-10-09T07:00:00.000Z')).toBeInTheDocument();
    expect(setInterval).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('a 2026-10-09T07:01:00.000Z')).toBeInTheDocument();
    expect(screen.getByText('b 2026-10-09T07:01:00.000Z')).toBeInTheDocument();

    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
