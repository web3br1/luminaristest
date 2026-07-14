import { describe, it, expect } from 'vitest';
import { humanizeZodFlatten, extractErrorMessage } from '../api-client';

// Locks out the "[object Object]" toast: when a controller returns
// `res.status(400).json({ error: parsed.error.flatten() })`, `result.error` is
// an OBJECT, and the old `String(result.error)` rendered "[object Object]".
describe('extractErrorMessage — Zod flatten body', () => {
  it('joins fieldErrors into "campo: erro; campo: erro"', () => {
    const flatten = {
      formErrors: [],
      fieldErrors: { year: ['Required'], period: ['Invalid enum value'] },
    };
    const msg = extractErrorMessage({ success: false, error: flatten }, 400, 'Bad Request');
    expect(msg).toBe('year: Required; period: Invalid enum value');
    expect(msg).not.toContain('[object Object]');
  });

  it('includes top-level formErrors', () => {
    const flatten = { formErrors: ['Body must be an object'], fieldErrors: {} };
    expect(humanizeZodFlatten(flatten)).toBe('Body must be an object');
  });

  it('falls back to a generic hint when the flatten carries no messages', () => {
    expect(humanizeZodFlatten({ formErrors: [], fieldErrors: {} })).toBe(
      'Verifique os campos e tente novamente.',
    );
  });

  it('still handles the plain-string error shape', () => {
    const msg = extractErrorMessage({ success: false, error: 'Período fechado' }, 400, 'Bad Request');
    expect(msg).toBe('Período fechado');
  });

  it('prefers message, then error, then status text', () => {
    expect(extractErrorMessage({ message: 'boom' }, 500, 'X')).toBe('boom');
    expect(extractErrorMessage({}, 404, 'Not Found')).toBe('Erro 404: Not Found');
  });
});
