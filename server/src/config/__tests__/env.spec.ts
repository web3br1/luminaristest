/**
 * Unit tests for the environment schema (pure — no process.env side effects).
 *
 * Importing `../env` runs the loader + validates the real process.env once; under Jest, jest.setupEnv
 * sets DATABASE_URL/NODE_ENV=test, so that import-time validation passes. Here we exercise the pure
 * `buildEnvSchema` / `validateEnv` against controlled sources, including the production-only rule.
 */
import { buildEnvSchema, validateEnv } from '../env';

describe('buildEnvSchema', () => {
  it('accepts a minimal valid env (DATABASE_URL present)', () => {
    const r = buildEnvSchema('development').safeParse({ NODE_ENV: 'development', DATABASE_URL: 'file:./dev.db' });
    expect(r.success).toBe(true);
  });

  it('rejects a missing DATABASE_URL', () => {
    const r = buildEnvSchema('development').safeParse({ NODE_ENV: 'development' });
    expect(r.success).toBe(false);
  });

  it('coerces PORT to a number and rejects a non-positive one', () => {
    expect(buildEnvSchema('development').parse({ DATABASE_URL: 'x', PORT: '3000' }).PORT).toBe(3000);
    expect(buildEnvSchema('development').safeParse({ DATABASE_URL: 'x', PORT: '-1' }).success).toBe(false);
  });

  it('requires JWT_SECRET in production', () => {
    const base = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x' };
    expect(buildEnvSchema('production').safeParse(base).success).toBe(false);
    expect(buildEnvSchema('production').safeParse({ ...base, JWT_SECRET: 's3cr3t' }).success).toBe(true);
  });

  it('does NOT require JWT_SECRET outside production', () => {
    expect(buildEnvSchema('development').safeParse({ DATABASE_URL: 'x' }).success).toBe(true);
    expect(buildEnvSchema('test').safeParse({ DATABASE_URL: 'x' }).success).toBe(true);
  });
});

describe('validateEnv', () => {
  it('returns the parsed env for a valid source', () => {
    const env = validateEnv({ NODE_ENV: 'test', DATABASE_URL: 'file:./t.db' } as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe('file:./t.db');
  });

  it('throws a single aggregated error listing the offending key', () => {
    expect(() => validateEnv({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it('throws in production when JWT_SECRET is missing', () => {
    expect(() =>
      validateEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_SECRET/);
  });
});
