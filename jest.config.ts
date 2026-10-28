import type { Config } from 'jest';
import nextJest from 'next/jest';

const createJestConfig = nextJest({
  dir: './',
});

// Note: ESM-only packages (react-markdown/unified ecosystem) are transpiled
// through `transpilePackages` in next.config.ts, which next/jest honors when
// building its transformIgnorePatterns.

const customJestConfig: Config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    // Pin KaTeX to a single CJS build in Jest. The exports map would otherwise
    // give ESM importers (rehype-katex) katex.mjs and CJS importers katex.js,
    // splitting the mhchem macro registration across two instances.
    '^katex$': '<rootDir>/node_modules/katex/dist/katex.js',
    '^katex/contrib/mhchem$': '<rootDir>/node_modules/katex/dist/contrib/mhchem.js',
    '^@/components/(.*)$': '<rootDir>/app/components/$1',
    '^@/utils/(.*)$': '<rootDir>/app/utils/$1',
    '^@/hooks/(.*)$': '<rootDir>/app/hooks/$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    '!app/**/*.d.ts',
    '!app/**/*.stories.{js,jsx,ts,tsx}',
    '!app/**/*.test.{js,jsx,ts,tsx}',
    '!app/**/index.{js,jsx,ts,tsx}',
  ],
};

export default createJestConfig(customJestConfig);
