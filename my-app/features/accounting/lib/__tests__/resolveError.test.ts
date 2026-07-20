import { describe, it, expect } from 'vitest';
import { resolveError, resolveErrorWithCode } from '../resolveError';

const FALLBACK = 'Ocorreu um erro.';

describe('resolveErrorWithCode (canonical accounting error resolver)', () => {
  it('extracts the server `error` string (standard controller error body)', () => {
    expect(resolveErrorWithCode({ success: false, error: 'Período fechado.', status: 409 }, FALLBACK))
      .toEqual({ message: 'Período fechado.', code: undefined });
  });

  it('prefers `message` over `error` when both are strings (global 500 handler shape)', () => {
    expect(
      resolveErrorWithCode(
        { error: 'Internal server error', message: 'SQLITE_BUSY: database is locked', status: 500 },
        FALLBACK
      ).message
    ).toBe('SQLITE_BUSY: database is locked');
  });

  it('carries a string `code` through (AP/AR branching)', () => {
    expect(
      resolveErrorWithCode({ error: 'Período fechado.', code: 'PERIOD_CLOSED', status: 409 }, FALLBACK)
    ).toEqual({ message: 'Período fechado.', code: 'PERIOD_CLOSED' });
  });

  it('ignores a non-string `code`', () => {
    expect(resolveErrorWithCode({ error: 'x', code: 42 }, FALLBACK).code).toBeUndefined();
  });

  it('falls back when `error` is a non-string (flattened Zod 400) — never "[object Object]"', () => {
    const zod400 = { success: false, error: { fieldErrors: { date: ['Invalid'] }, formErrors: [] }, status: 400 };
    expect(resolveErrorWithCode(zod400, FALLBACK)).toEqual({ message: FALLBACK, code: undefined });
  });

  it('falls back on null / undefined / primitive throws', () => {
    expect(resolveErrorWithCode(null, FALLBACK).message).toBe(FALLBACK);
    expect(resolveErrorWithCode(undefined, FALLBACK).message).toBe(FALLBACK);
    expect(resolveErrorWithCode('boom', FALLBACK).message).toBe(FALLBACK);
  });
});

describe('resolveError (string wrapper)', () => {
  it('returns just the message', () => {
    expect(resolveError({ error: 'Falhou.' }, FALLBACK)).toBe('Falhou.');
    expect(resolveError({}, FALLBACK)).toBe(FALLBACK);
  });
});
