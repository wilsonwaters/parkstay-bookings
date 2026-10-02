/**
 * @jest-environment node
 *
 * The Tailwind theme exposes the semantic token names, backed by tokens.css variables,
 * and keeps the old `primary` scale only as a commented legacy alias of ocean.
 */
import fs from 'fs';
import path from 'path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const CONFIG_PATH = path.resolve(__dirname, '../../../tailwind.config.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require(CONFIG_PATH);

async function compile(classes: string, css = '@tailwind utilities;'): Promise<string> {
  const result = await postcss([
    tailwindcss({
      ...config,
      content: [{ raw: `<div class="${classes}"></div>`, extension: 'html' }],
    }),
  ]).process(css, { from: undefined });
  return result.css.replace(/\s+/g, ' ');
}

describe('tailwind theme', () => {
  it('compiles semantic colour utilities onto RGB-triple variables', async () => {
    const css = await compile(
      'bg-accent text-accent-fg hover:bg-accent-hover text-fg-muted border-border-strong ring-focus bg-surface-subtle text-available-fg bg-sun-subtle'
    );
    expect(css).toContain(
      '.bg-accent { --tw-bg-opacity: 1; background-color: rgb(var(--ws-accent) / var(--tw-bg-opacity, 1))'
    );
    expect(css).toContain('color: rgb(var(--ws-accent-fg) / var(--tw-text-opacity, 1))');
    expect(css).toContain('background-color: rgb(var(--ws-accent-hover)');
    expect(css).toContain('color: rgb(var(--ws-fg-muted)');
    expect(css).toContain(
      '.border-border-strong { --tw-border-opacity: 1; border-color: rgb(var(--ws-border-strong)'
    );
    expect(css).toContain(
      '.ring-focus { --tw-ring-opacity: 1; --tw-ring-color: rgb(var(--ws-focus)'
    );
    expect(css).toContain('background-color: rgb(var(--ws-surface-subtle)');
    expect(css).toContain('color: rgb(var(--ws-available-fg)');
    expect(css).toContain('background-color: rgb(var(--ws-sun-subtle)');
  });

  it('makes a bare ring the opaque focus colour, with a surface-coloured offset', async () => {
    // The ring defaults are emitted with the base layer, so compile that too.
    const css = await compile('ring-2 ring-offset-2', '@tailwind base; @tailwind utilities;');
    const ringColors = css.match(/--tw-ring-color: [^;]+;/g) ?? [];
    const offsetColors = css.match(/--tw-ring-offset-color: [^;]+;/g) ?? [];

    expect(ringColors.length).toBeGreaterThan(0);
    expect(offsetColors.length).toBeGreaterThan(0);
    for (const decl of ringColors) expect(decl).toBe('--tw-ring-color: rgb(var(--ws-focus) / 1);');
    for (const decl of offsetColors)
      expect(decl).toBe('--tw-ring-offset-color: rgb(var(--ws-surface));');
    // Neither Tailwind's default blue-500/50 nor its <alpha-value> fallback (blue-300).
    expect(css).not.toMatch(/59 130 246|147 197 253|<alpha-value>/);
  });

  it('keeps explicit ring colours, such as ring-focus/40, working alongside the default', async () => {
    const css = await compile('ring-2 ring-focus/40');
    expect(css).toContain('--tw-ring-color: rgb(var(--ws-focus) / 0.4)');
  });

  it('only darkens the legacy bridge buttons on hover while they are enabled', async () => {
    const indexCss = fs.readFileSync(
      path.resolve(__dirname, '../../../src/renderer/styles/index.css'),
      'utf8'
    );
    const css = await compile('btn-primary btn-secondary btn-danger', indexCss);
    for (const btn of ['btn-primary', 'btn-secondary', 'btn-danger']) {
      expect(css).toMatch(new RegExp(`\\.${btn}:hover:not\\(:disabled\\)\\s*\\{`));
      expect(css).not.toMatch(new RegExp(`\\.${btn}:hover\\s*\\{`));
    }
  });

  it('supports alpha modifiers such as bg-accent/10', async () => {
    const css = await compile('bg-accent/10');
    expect(css).toContain('background-color: rgb(var(--ws-accent) / 0.1)');
  });

  it('maps type, radii, shadows, motion, layers and keyframes to tokens', async () => {
    const css = await compile(
      'font-sans font-display text-display-lg text-sm rounded-md rounded-lg shadow-card shadow-modal duration-fast ease-standard z-header z-tooltip animate-shimmer animate-fade-in animate-scale-in'
    );
    expect(css).toContain('font-family: var(--ws-font-sans)');
    expect(css).toContain('font-family: var(--ws-font-display)');
    expect(css).toContain(
      'font-size: var(--ws-text-display-lg); line-height: var(--ws-leading-display-lg)'
    );
    expect(css).toContain('font-size: var(--ws-text-sm); line-height: var(--ws-leading-sm)');
    expect(css).toContain('border-radius: var(--ws-radius-md)');
    expect(css).toContain('border-radius: var(--ws-radius-lg)');
    expect(css).toContain('--tw-shadow: var(--ws-shadow-card)');
    expect(css).toContain('--tw-shadow: var(--ws-shadow-modal)');
    expect(css).toContain('transition-duration: var(--ws-duration-fast)');
    expect(css).toContain('transition-timing-function: var(--ws-ease-standard)');
    expect(css).toContain('z-index: var(--ws-z-header)');
    expect(css).toContain('z-index: var(--ws-z-tooltip)');
    expect(css).toMatch(/@keyframes shimmer/);
    expect(css).toMatch(/@keyframes fade-in/);
    expect(css).toMatch(/@keyframes scale-in/);
    expect(css).toContain(
      'animation: fade-in var(--ws-duration-base) var(--ws-ease-standard) both'
    );
  });

  it('keeps Tailwind defaults for legacy pages', async () => {
    const css = await compile('bg-gray-50 text-red-600');
    expect(css).toContain('.bg-gray-50');
    expect(css).toContain('.text-red-600');
  });

  it('re-points legacy primary-* at ocean, and declares it only in the legacy block', async () => {
    const css = await compile('bg-primary-600 text-primary-700 focus:ring-primary-500');
    expect(css).toContain('background-color: rgb(var(--ws-ocean-600)');
    expect(css).toContain('color: rgb(var(--ws-ocean-700)');
    expect(css).toContain('--tw-ring-color: rgb(var(--ws-ocean-500)');

    const source = fs.readFileSync(CONFIG_PATH, 'utf8');
    const start = source.indexOf('// legacy: delete when U-stream lands');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('},', source.indexOf('primary: {', start));
    const outside = source.slice(0, start) + source.slice(end);
    expect(outside).not.toMatch(/primary/);
    expect(source.slice(start, end)).toMatch(/primary: \{/);
    expect(source).not.toMatch(/#[0-9a-f]{6}/i);
  });
});
