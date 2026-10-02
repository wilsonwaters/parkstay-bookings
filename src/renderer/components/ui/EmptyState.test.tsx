import { render, screen } from '@testing-library/react';
import { BellRing } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('has a heading, a description and the next step', () => {
    render(
      <EmptyState
        icon={<BellRing size={24} />}
        title="No watches yet"
        description="Pick a place and dates, and WA Stay checks for openings every few minutes."
        actions={<Button>Create watch</Button>}
        accent="sun"
      />
    );
    expect(screen.getByRole('heading', { level: 2, name: 'No watches yet' })).toBeInTheDocument();
    expect(screen.getByText(/checks for openings/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create watch' })).toBeInTheDocument();
    // The icon and the brush accent are decorative.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('can use an h3 inside a section', () => {
    render(<EmptyState title="No results" headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'No results' })).toBeInTheDocument();
  });
});
