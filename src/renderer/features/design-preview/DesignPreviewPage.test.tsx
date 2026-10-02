import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DesignPreviewPage from './DesignPreviewPage';
import { CONTRAST_PAIRS } from '../../styles/contrast';

const SECTIONS = [
  'Palette',
  'Semantic colours',
  'Contrast pairs',
  'Type',
  'Spacing',
  'Radii',
  'Elevation',
  'Motion',
  'Icons',
  'Brushstroke',
  'Photo placeholder',
  'Focus and legacy controls',
];

describe('DesignPreviewPage', () => {
  it('has one page heading and a heading per section', () => {
    render(<DesignPreviewPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Design language' })).toBeInTheDocument();
    const h2s = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2s).toEqual(SECTIONS);
    for (const name of SECTIONS) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
  });

  it('renders one contrast row per CONTRAST_PAIRS entry, all passing', () => {
    render(<DesignPreviewPage />);
    const table = screen.getByRole('table', { name: 'Contrast pairs' });
    const [, ...rows] = within(table).getAllByRole('row');
    expect(rows).toHaveLength(CONTRAST_PAIRS.length);

    rows.forEach((row, i) => {
      const cells = within(row).getAllByRole('cell');
      expect(cells[1]).toHaveTextContent(CONTRAST_PAIRS[i].fg);
      expect(cells[2]).toHaveTextContent(CONTRAST_PAIRS[i].bg);
      expect(cells[3]).toHaveTextContent(/^\d+\.\d{2}:1$/);
      expect(cells[5]).toHaveTextContent('Pass');
    });
    expect(screen.getByText(/All pairs pass\./)).toBeInTheDocument();
  });

  it('shows swatches with the live hex and contrast against surface and canvas', () => {
    render(<DesignPreviewPage />);
    const semantic = screen.getByRole('region', { name: 'Semantic colours' });
    const accent = within(semantic)
      .getAllByRole('listitem')
      .find((li) => within(li).queryByText('accent', { exact: true }));
    expect(accent).toBeDefined();
    expect(accent).toHaveTextContent(/#[0-9A-F]{6}/);
    expect(accent).toHaveTextContent('coral-600');
    expect(accent).toHaveTextContent(/\d+\.\d{2}:1 on surface/);
    expect(accent).toHaveTextContent(/\d+\.\d{2}:1 on canvas/);
  });

  it('shows the atoms: photo placeholders by name and decorative brushstrokes', () => {
    render(<DesignPreviewPage />);
    expect(
      screen.getByRole('img', { name: 'No photo available for Lucky Bay' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'No photo available for Coral Bay' })
    ).toBeInTheDocument();
    const brush = screen.getByRole('region', { name: 'Brushstroke' });
    expect(within(brush).queryAllByRole('img')).toHaveLength(0);
  });

  it('lets the motion demo be replayed and toggled from the keyboard', async () => {
    const user = userEvent.setup();
    render(<DesignPreviewPage />);
    const motion = screen.getByRole('region', { name: 'Motion' });
    const move = within(motion).getByRole('button', { name: 'Move' });

    expect(move).toHaveAttribute('aria-pressed', 'false');
    move.focus();
    await user.keyboard('{Enter}');
    expect(move).toHaveAttribute('aria-pressed', 'true');
    expect(within(motion).getByRole('button', { name: 'Replay' })).toBeEnabled();
  });
});
