import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import ToastContainer, { useToast } from './Toast';

describe('ToastContainer', () => {
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders toasts', () => {
    const toasts = [
      { id: '1', type: 'success' as const, message: 'Success message' },
      { id: '2', type: 'error' as const, message: 'Error message' },
    ];
    render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);
    expect(screen.getByText('Success message')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('removes toast when close button is clicked', () => {
    const toasts = [{ id: '1', type: 'info' as const, message: 'Info message' }];
    render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);

    const closeButtons = screen.getAllByRole('button');
    fireEvent.click(closeButtons[0]);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mockOnRemove).toHaveBeenCalledWith('1');
  });

  it('auto-removes toast after duration', () => {
    const toasts = [{ id: '1', type: 'success' as const, message: 'Test', duration: 3000 }];
    render(<ToastContainer toasts={toasts} onRemove={mockOnRemove} />);

    act(() => {
      jest.advanceTimersByTime(3300); // duration + exit animation
    });

    expect(mockOnRemove).toHaveBeenCalledWith('1');
  });
});

describe('useToast hook', () => {
  it('adds and removes toasts', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Success message');
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Success message');
    expect(result.current.toasts[0].type).toBe('success');

    act(() => {
      result.current.removeToast(result.current.toasts[0].id);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('provides convenience methods for all toast types', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.success('Success');
      result.current.error('Error');
      result.current.warning('Warning');
      result.current.info('Info');
    });

    expect(result.current.toasts).toHaveLength(4);
    expect(result.current.toasts[0].type).toBe('success');
    expect(result.current.toasts[1].type).toBe('error');
    expect(result.current.toasts[2].type).toBe('warning');
    expect(result.current.toasts[3].type).toBe('info');
  });
});
