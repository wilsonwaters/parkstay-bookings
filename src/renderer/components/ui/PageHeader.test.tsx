import { render, screen } from '@testing-library/react';
import { Button } from './Button';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders one h1 with description, actions and a back link', () => {
    render(
      <PageHeader
        title="Watches"
        description="WA Stay checks these for openings."
        actions={<Button>Create watch</Button>}
        back={{ label: 'Explore', href: '#/' }}
      />
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Watches' })).toBeInTheDocument();
    expect(screen.getByText('WA Stay checks these for openings.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create watch' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explore' })).toHaveAttribute('href', '#/');
  });

  it('has no back link unless asked', () => {
    render(<PageHeader title="Settings" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
