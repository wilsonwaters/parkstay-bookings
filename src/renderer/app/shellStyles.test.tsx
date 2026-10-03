/**
 * Shell CSS, checked against the real stylesheet: src/renderer/styles/index.css compiled with
 * the Tailwind config, applied in jsdom and read back with getComputedStyle.
 */
import fs from 'fs';
import path from 'path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { render, screen } from '@testing-library/react';
import { LegacyPageFrame } from './LegacyPageFrame';

const ROOT = path.resolve(__dirname, '../../..');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require(path.join(ROOT, 'tailwind.config.js'));
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

let style: HTMLStyleElement;

beforeAll(async () => {
  // tokens.css is only custom properties; jsdom would not load the @import anyway.
  const indexCss = read('src/renderer/styles/index.css').replace(/^@import .*$/m, '');
  const result = await postcss([
    tailwindcss({
      ...config,
      content: [
        { raw: read('src/renderer/app/LegacyPageFrame.tsx'), extension: 'tsx' },
        { raw: '<div class="p-6"></div>', extension: 'html' },
      ],
    }),
  ]).process(indexCss, { from: undefined });
  style = document.createElement('style');
  style.textContent = result.css;
  document.head.appendChild(style);
});

afterAll(() => style.remove());

describe('focus ring', () => {
  it('is not drawn on a heading that took focus from code (tabindex -1)', () => {
    render(
      <>
        <h1 tabIndex={-1}>Watches</h1>
        <h2 tabIndex={-1}>Section</h2>
      </>
    );
    for (const heading of screen.getAllByRole('heading')) {
      heading.focus();
      expect(heading).toHaveFocus();
      expect(getComputedStyle(heading).outline).toBe('none');
    }
  });

  it('is still drawn on anything a person can Tab to', () => {
    render(
      <>
        <button type="button">Save</button>
        <a href="#/watches">Watches</a>
      </>
    );
    for (const el of [screen.getByRole('button'), screen.getByRole('link')]) {
      el.focus();
      expect(getComputedStyle(el).outline).toMatch(/^2px solid rgb\(var\(--ws-focus\)\)/);
    }
  });
});

describe('LegacyPageFrame', () => {
  it('cancels a legacy page root p-6, so the gutter is not doubled', () => {
    render(
      <LegacyPageFrame>
        <div className="p-6" data-testid="legacy-root">
          <h1>Watches</h1>
        </div>
      </LegacyPageFrame>
    );
    const root = screen.getByTestId('legacy-root');
    expect(getComputedStyle(root).paddingLeft).toBe('0px');
    expect(getComputedStyle(root).paddingTop).toBe('0px');
    // The frame itself has the new pages' gutter.
    const frame = root.parentElement as HTMLElement;
    expect(frame).toHaveClass('px-6', 'py-8', 'lg:px-8', 'max-w-7xl');
  });

  it('leaves padding deeper inside the page alone', () => {
    render(
      <LegacyPageFrame>
        <section>
          <div className="p-6" data-testid="card" />
        </section>
      </LegacyPageFrame>
    );
    expect(getComputedStyle(screen.getByTestId('card')).paddingLeft).toBe('1.5rem');
  });
});
