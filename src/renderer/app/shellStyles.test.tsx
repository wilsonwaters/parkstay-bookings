/**
 * Shell CSS, checked against the real stylesheet: src/renderer/styles/index.css compiled with
 * Tailwind, applied in jsdom and read back with getComputedStyle.
 */
import { render, screen } from '@testing-library/react';
import { compileStylesheet } from '@tests/utils/tailwind';

let style: HTMLStyleElement;

beforeAll(async () => {
  style = document.createElement('style');
  style.textContent = await compileStylesheet({ unlayered: true });
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
