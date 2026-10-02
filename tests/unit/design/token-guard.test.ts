/**
 * @jest-environment node
 *
 * Token guard: new renderer code builds only on design tokens.
 * Scans components/ui, app, features, api and components/LocationCard* (legacy folders
 * excluded) for raw Tailwind palette classes, hex literals and emoji.
 */
import fs from 'fs';
import path from 'path';

const RENDERER = path.resolve(__dirname, '../../../src/renderer');
const SCAN_DIRS = ['components/ui', 'app', 'features', 'api'];
const SCAN_FILE_PREFIXES = ['components/LocationCard'];
const SOURCE = /\.(ts|tsx)$/;

const PALETTE_CLASS =
  /(?<![\w-])(bg|text|border(?:-[xytrbl])?|ring(?:-offset)?|fill|stroke|from|via|to|outline|divide|placeholder|shadow|decoration|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|primary)-\d{2,3}\b/g;
const HEX_LITERAL = /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi;
const EMOJI = /\p{Extended_Pictographic}/gu;

interface Violation {
  line: number;
  rule: 'palette class' | 'hex literal' | 'emoji';
  match: string;
}

/** Blanks out comments while keeping line numbers, so commented-out classes are ignored. */
function stripComments(source: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:\\])\/\/.*$/gm, (m, lead: string) => lead + blank(m.slice(lead.length)));
}

function scanSource(source: string): Violation[] {
  const code = stripComments(source);
  const lineOf = (index: number) => code.slice(0, index).split('\n').length;
  const found: Violation[] = [];
  const rules: [Violation['rule'], RegExp][] = [
    ['palette class', PALETTE_CLASS],
    ['hex literal', HEX_LITERAL],
    ['emoji', EMOJI],
  ];
  for (const [rule, regex] of rules) {
    for (const m of code.matchAll(regex)) {
      found.push({ line: lineOf(m.index ?? 0), rule, match: m[0] });
    }
  }
  return found;
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'legacy' ? [] : walk(full);
    return SOURCE.test(entry.name) ? [full] : [];
  });
}

function filesToScan(): string[] {
  const fromDirs = SCAN_DIRS.flatMap((d) => walk(path.join(RENDERER, d)));
  const fromPrefixes = SCAN_FILE_PREFIXES.flatMap((prefix) => {
    const dir = path.join(RENDERER, path.dirname(prefix));
    const base = path.basename(prefix);
    return walk(dir).filter((f) => path.dirname(f) === dir && path.basename(f).startsWith(base));
  });
  return [...new Set([...fromDirs, ...fromPrefixes])];
}

describe('token guard self-test', () => {
  it('flags raw palette classes, including the legacy primary scale', () => {
    const v = scanSource(
      'const a = "bg-gray-500 hover:text-primary-600"; const b = `focus:ring-sky-300 divide-stone-200 border-t-gray-200`;'
    );
    expect(v.map((x) => x.match)).toEqual([
      'bg-gray-500',
      'text-primary-600',
      'ring-sky-300',
      'divide-stone-200',
      'border-t-gray-200',
    ]);
  });

  it('flags hex literals and emoji, and reports the line', () => {
    const v = scanSource(
      "const a = 1;\nconst c = '#C4432A';\nconst d = { color: '#fff' };\nconst e = '\u{1F3D5}️';"
    );
    expect(v).toEqual([
      { line: 2, rule: 'hex literal', match: '#C4432A' },
      { line: 3, rule: 'hex literal', match: '#fff' },
      { line: 4, rule: 'emoji', match: '\u{1F3D5}' },
    ]);
  });

  it('accepts semantic classes, routes, entities and comments', () => {
    const clean = [
      'className="bg-accent text-accent-fg hover:bg-accent-hover border-border-strong ring-focus"',
      'className="text-fg-muted bg-surface-subtle from-surface-subtle via-canvas shadow-card"',
      '<a href="#/__design">Design</a> <span>3&#8211;5 Oct</span>',
      'const url = "https://example.com/#anchor";',
      '// legacy note: bg-gray-500 and #fff are fine in a comment',
      '/* text-red-600 #C4432A */',
      'const s = "photo-gray-500 is not a class";',
    ].join('\n');
    expect(scanSource(clean)).toEqual([]);
  });
});

describe('token guard', () => {
  const files = filesToScan();

  it('scans the design-system folders (components/ui at least)', () => {
    expect(files.some((f) => f.includes(`${path.sep}components${path.sep}ui${path.sep}`))).toBe(
      true
    );
    expect(files.every((f) => !f.split(path.sep).includes('legacy'))).toBe(true);
  });

  it('finds no raw palette classes, hex literals or emoji', () => {
    const report = files.flatMap((file) =>
      scanSource(fs.readFileSync(file, 'utf8')).map(
        (v) => `${path.relative(RENDERER, file)}:${v.line} ${v.rule} "${v.match}"`
      )
    );
    expect(report).toEqual([]);
  });
});
