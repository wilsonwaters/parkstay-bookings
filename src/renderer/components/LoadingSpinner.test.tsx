import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders without crashing', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('displays custom text when provided', () => {
    render(<LoadingSpinner text="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('renders in fullScreen mode', () => {
    const { container } = render(<LoadingSpinner fullScreen />);
    expect(container.querySelector('.min-h-screen')).toBeInTheDocument();
  });

  it('applies correct size classes', () => {
    const { container, rerender } = render(<LoadingSpinner size="sm" />);
    expect(container.querySelector('.h-6')).toBeInTheDocument();

    rerender(<LoadingSpinner size="lg" />);
    expect(container.querySelector('.h-16')).toBeInTheDocument();
  });
});
