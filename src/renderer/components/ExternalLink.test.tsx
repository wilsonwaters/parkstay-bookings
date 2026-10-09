import { render, screen } from '@testing-library/react';
import { ExternalLink } from './ExternalLink';

describe('ExternalLink', () => {
  it('opens in the system browser with no referrer, and says so', () => {
    render(<ExternalLink href="https://parkstay.dbca.wa.gov.au">View on ParkStay</ExternalLink>);
    const link = screen.getByRole('link', { name: 'View on ParkStay (opens in your browser)' });
    expect(link).toHaveAttribute('href', 'https://parkstay.dbca.wa.gov.au');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    // The trailing icon is decorative.
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('can look like a button', () => {
    render(
      <ExternalLink href="https://parkstay.dbca.wa.gov.au/x" variant="primary" fullWidth>
        Book on ParkStay
      </ExternalLink>
    );
    expect(
      screen.getByRole('link', { name: 'Book on ParkStay (opens in your browser)' })
    ).toHaveAttribute('target', '_blank');
  });
});
