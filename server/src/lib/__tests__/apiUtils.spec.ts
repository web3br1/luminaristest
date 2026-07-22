/**
 * Unit tests for handleApiError — the centralized error→HTTP mapping (pure, no DB/HTTP).
 *
 * This is the single source of truth for status/code mapping, used by every controller catch AND by
 * the global Express error handler in app.ts. Locks the contract, especially the Prisma P2025 → 404
 * mapping added so update/delete races return 404 (not 500) even where not caught locally.
 */
import { handleApiError } from '../apiUtils';
import { AppError, ValidationError, NotFoundError, ForbiddenError } from '../errors';
import { ZodError, z } from 'zod';

/** Minimal Express `res` double capturing status + json. */
function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as { status: jest.Mock; json: jest.Mock };
}

const bodyOf = (res: { json: jest.Mock }) => res.json.mock.calls[0][0];

describe('handleApiError', () => {
  it('maps a ZodError to 400 VALIDATION_ERROR with issue details', () => {
    const res = mockRes();
    const err = z.object({ a: z.string() }).safeParse({});
    handleApiError((err as { error: ZodError }).error, res as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(bodyOf(res).code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(bodyOf(res).details)).toBe(true);
  });

  it('maps an AppError to its own status and code', () => {
    const res = mockRes();
    handleApiError(new ForbiddenError('nope'), res as any);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(bodyOf(res).code).toBe('FORBIDDEN');
  });

  it('includes ValidationError details when present', () => {
    const res = mockRes();
    handleApiError(new ValidationError('bad', { field: ['required'] }), res as any);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(bodyOf(res).details).toEqual({ field: ['required'] });
  });

  it('maps Prisma P2002 to 409 CONFLICT with the offending fields', () => {
    const res = mockRes();
    handleApiError({ code: 'P2002', meta: { target: ['email'] } }, res as any);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(bodyOf(res).code).toBe('CONFLICT');
    expect(bodyOf(res).details).toEqual({ fields: ['email'] });
  });

  it('maps Prisma P2025 to 404 NOT_FOUND (the new central mapping)', () => {
    const res = mockRes();
    handleApiError({ code: 'P2025', meta: {} }, res as any);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(bodyOf(res).code).toBe('NOT_FOUND');
  });

  it('maps an unknown error to 500 without leaking internals (non-development)', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = mockRes();
      handleApiError(new Error('secret stack detail'), res as any);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(bodyOf(res).code).toBe('INTERNAL_SERVER_ERROR');
      expect(bodyOf(res).details).toBeUndefined();
      expect(JSON.stringify(bodyOf(res))).not.toContain('secret stack detail');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('confirms NotFoundError still maps to 404 (AppError path)', () => {
    const res = mockRes();
    handleApiError(new NotFoundError('gone'), res as any);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
