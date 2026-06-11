/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@server/(.*)$': '<rootDir>/src/$1'
    },
    testMatch: [
        "**/__tests__/**/*.spec.ts",
        "**/__tests__/**/*.test.ts"
    ],
    testPathIgnorePatterns: [
        "/node_modules/",
        "/legacy_kpis/"
    ],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
        }],
    },
};
