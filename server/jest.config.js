/** @type {import('ts-jest').JestConfigWithTsJest} */

// Shared config for both projects. Tests are split by Jest "projects":
//   - unit:        fast, no DB. Everything except *.integration.test.ts.
//   - integration: hits the real SQLite test DB. Run --runInBand so files never race on the file.
// Convention: name any test that touches the DB / HTTP stack `*.integration.test.ts`.
const base = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/test/jest.setupEnv.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@server/(.*)$': '<rootDir>/src/$1',
        '^@test/(.*)$': '<rootDir>/test/$1',
        '^generated/(.*)$': '<rootDir>/generated/$1',
        // ESM-only package pulled in at import time by lib/pdf.ts (ReceiptService); no test renders
        // a PDF, so stub the module instead of transforming the whole puppeteer tree.
        '^puppeteer$': '<rootDir>/test/mocks/puppeteer.ts',
        // Vector ops need a live Qdrant server; tests stub the client (CI runs with dummy creds).
        '^@qdrant/js-client-rest$': '<rootDir>/test/mocks/qdrantClient.ts',
    },
    transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
        // ESM-only deps (uuid v13, qdrant) ship no CJS build; ts-jest down-compiles them.
        // isolatedModules: skip type-checking node_modules JS (only our TS is type-checked).
        '^.+\\.jsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json', isolatedModules: true }],
    },
    // Default ignores all of node_modules; the negative lookahead lets the ESM deps above through.
    transformIgnorePatterns: ['/node_modules/(?!(uuid|@qdrant/js-client-rest)/)'],
};

module.exports = {
    projects: [
        {
            ...base,
            displayName: 'unit',
            testMatch: [
                '**/__tests__/**/*.spec.ts',
                '**/__tests__/**/*.test.ts',
            ],
            testPathIgnorePatterns: [
                '/node_modules/',
                '/legacy_kpis/',
                '\\.integration\\.test\\.ts$',
            ],
        },
        {
            ...base,
            displayName: 'integration',
            testMatch: ['**/__tests__/**/*.integration.test.ts'],
            testPathIgnorePatterns: ['/node_modules/', '/legacy_kpis/'],
        },
    ],

    // Coverage (collected across both projects when run with --coverage).
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/__tests__/**',
        '!src/server.ts',
        '!src/app.ts',
        '!src/scripts/**',
        '!src/types/**',
    ],
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: ['text-summary', 'lcov'],

    // Ratchet floor: set just below the current measured baseline (2026-06-26: 43.8% stmts /
    // 29.0% branches / 38.5% funcs / 44.7% lines — after the feature test rollout Stages 1-5).
    // It only FAILS the run if coverage REGRESSES below the floor. Raise these numbers as more
    // coverage lands (dynamicTables, pipelines) so the gain never silently slips.
    coverageThreshold: {
        global: {
            statements: 50,
            branches: 36,
            functions: 46,
            lines: 51,
        },
    },
};
