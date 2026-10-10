import { act, render, screen } from '@testing-library/react';
import { Countdown } from './Countdown';
import { formatCountdown } from './countdown';

const MINUTE = 60_000;

describe('formatCountdown', () => {
  it('clock: days and hours, hours and minutes, then minutes and seconds', () => {
    expect(formatCountdown(2 * 86_400_000 + 4 * 3_600_000 + 5 * MINUTE)).toBe('2d 4h');
    expect(formatCountdown(4 * 3_600_000 + 5 * MINUTE + 30_000)).toBe('4h 05m');
    expect(formatCountdown(23 * MINUTE + 10_000)).toBe('23:10');
    expect(formatCountdown(999)).toBe('00:01');
  });

  it('minutes: rounded up, with hours past the hour', () => {
    expect(formatCountdown(12 * MINUTE, 'minutes')).toBe('12 min');
    expect(formatCountdown(11 * MINUTE + 1, 'minutes')).toBe('12 min');
    expect(formatCountdown(20_000, 'minutes')).toBe('1 min');
    expect(formatCountdown(65 * MINUTE, 'minutes')).toBe('1 h 05 min');
  });

  it('never goes negative', () => {
    expect(formatCountdown(-5000)).toBe('now');
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(-5000, 'minutes')).toBe('0 min');
    expect(formatCountdown(Number.NaN, 'minutes')).toBe('0 min');
  });
});

describe('Countdown', () => {
  afterEach(() => jest.useRealTimers());

  it('is a timer that counts down from the shared ticker and stops at zero', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-09T07:00:00Z'));
    const { unmount } = render(<Countdown to="2026-10-09T07:12:00Z" format="minutes" />);
    const timer = screen.getByRole('timer');
    expect(timer).toHaveTextContent('12 min');
    expect(timer).not.toHaveAttribute('aria-live');

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(timer).toHaveTextContent('11 min');

    act(() => {
      jest.advanceTimersByTime(20 * 60_000);
    });
    expect(timer).toHaveTextContent('0 min');

    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
