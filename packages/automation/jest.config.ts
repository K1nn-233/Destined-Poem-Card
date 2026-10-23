import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '^@destiny/game/schema$': '<rootDir>/../game/src/schema/index.ts',
    '^@destiny/game/rules$': '<rootDir>/../game/src/rules/index.ts',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.json',
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: ['node_modules', 'dist', '/@types/'],
  coverageReporters: ['text', 'lcov', 'json'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

export default config;
