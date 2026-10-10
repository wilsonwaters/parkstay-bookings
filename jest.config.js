/**
 * Jest configuration: two projects built from one shared base.
 *
 * - main:     Electron main process, shared code and Node scripts (testEnvironment: node)
 * - renderer: React renderer (testEnvironment: jsdom), including tests/integration/renderer
 *
 * Jest projects do not inherit root options, so everything both projects need
 * (roots, transform, module aliases) lives in `base` and is spread into each.
 * Coverage options stay at the root: coverage is aggregated across both projects and
 * the threshold is evaluated once, globally.
 */

const TEST_FILE = '*.test.[jt]s?(x)';

const base = {
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  transform: {
    // Vite `?raw` imports (brushstroke SVGs, tokens.css) load as their real file contents.
    // Plain `.svg` and stylesheet imports never reach this: moduleNameMapper stubs them.
    '\\.(svg|css)$': '<rootDir>/tests/utils/raw-file-transform.js',
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          isolatedModules: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@main/(.*)$': '<rootDir>/src/main/$1',
    '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@preload/(.*)$': '<rootDir>/src/preload/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    // `?raw` must map first so raw imports get the real file (via raw-file-transform.js).
    '^(.+\\.(svg|css))\\?raw$': '$1',
    // A plain asset import is a URL in Vite, so it gets a URL-shaped string. A mapped module is
    // one file shared by every import, so the generic stub cannot name the asset. Assets a test
    // must tell apart (the brand logos) have a named stub, tests/utils/asset-urls/<file>.js.
    '^(?:.*/)?([^/]+\\.(?:svg|png))$': [
      '<rootDir>/tests/utils/asset-urls/$1.js',
      '<rootDir>/tests/utils/file-url-stub.js',
    ],
    // Bundled fonts (`import '@fontsource-variable/figtree'`) are stylesheets too.
    '^@fontsource-variable/': '<rootDir>/tests/utils/style-mock.js',
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/utils/style-mock.js',
  },
};

module.exports = {
  projects: [
    {
      ...base,
      displayName: 'main',
      testEnvironment: 'node',
      testMatch: [
        `<rootDir>/tests/unit/**/${TEST_FILE}`,
        `<rootDir>/tests/integration/**/${TEST_FILE}`,
        `<rootDir>/tests/scripts/**/${TEST_FILE}`,
        `<rootDir>/src/main/**/${TEST_FILE}`,
        `<rootDir>/src/shared/**/${TEST_FILE}`,
      ],
      // Renderer integration tests need jsdom: the renderer project runs them.
      testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/integration/renderer/'],
      setupFiles: ['<rootDir>/tests/setup/main.ts'],
    },
    {
      ...base,
      displayName: 'renderer',
      testEnvironment: 'jsdom',
      testMatch: [
        `<rootDir>/src/renderer/**/${TEST_FILE}`,
        `<rootDir>/tests/renderer/**/${TEST_FILE}`,
        `<rootDir>/tests/integration/renderer/**/${TEST_FILE}`,
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/setup/renderer.ts'],
    },
  ],
  collectCoverageFrom: [
    'src/main/**/*.{ts,tsx}',
    'src/renderer/**/*.{ts,tsx}',
    'src/shared/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.spec.{ts,tsx}',
    '!src/**/*.types.ts',
    '!src/main/index.ts',
    '!src/renderer/main.tsx',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // A ratchet a few points below the measured coverage (2.0: branches 87, functions 93, lines 96,
  // statements 94), so a change that drops tests fails here. Raise it as coverage grows; never
  // lower it to pass.
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 93,
      statements: 92,
    },
  },
  testTimeout: 30000,
};
