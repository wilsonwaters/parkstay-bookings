/**
 * Jest configuration: two projects built from one shared base.
 *
 * - main:     Electron main process, shared code and Node scripts (testEnvironment: node)
 * - renderer: React renderer (testEnvironment: jsdom)
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
      setupFiles: ['<rootDir>/tests/setup/main.ts'],
    },
    {
      ...base,
      displayName: 'renderer',
      testEnvironment: 'jsdom',
      testMatch: [
        `<rootDir>/src/renderer/**/${TEST_FILE}`,
        `<rootDir>/tests/renderer/**/${TEST_FILE}`,
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
  coverageThreshold: {
    global: {
      branches: 9,
      functions: 17,
      lines: 16,
      statements: 16,
    },
  },
  testTimeout: 30000,
};
