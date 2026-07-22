/**
 * Unit tests for the users DTOs (the Zod validation boundary) — pure, no I/O.
 *
 * The boundary is where malformed/hostile input is rejected before it reaches the service, so we
 * test the LIMITS (what must be rejected), not just the happy path. Part of the gold test template:
 * every feature's `dtos/` gets a matching `*Dto.spec.ts`.
 */
import {
  CreateUserSchema,
  UpdateUserSchema,
  ListUsersQuerySchema,
  UpdatePreferencesSchema,
} from '../UserDto';
import { Role } from '../../models/User.model';

describe('CreateUserSchema', () => {
  const valid = { username: 'alice', email: 'alice@test.co', password: 'Passw0rd' };

  it('accepts a valid payload', () => {
    expect(CreateUserSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts an explicit valid role', () => {
    expect(CreateUserSchema.safeParse({ ...valid, role: Role.ADMIN }).success).toBe(true);
  });

  it('rejects a missing username', () => {
    const { username, ...rest } = valid;
    expect(CreateUserSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a too-short username (<3)', () => {
    expect(CreateUserSchema.safeParse({ ...valid, username: 'ab' }).success).toBe(false);
  });

  it('rejects a username with illegal characters', () => {
    expect(CreateUserSchema.safeParse({ ...valid, username: 'bad name!' }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(CreateUserSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a weak password (no uppercase/number, too short)', () => {
    expect(CreateUserSchema.safeParse({ ...valid, password: 'weak' }).success).toBe(false);
    expect(CreateUserSchema.safeParse({ ...valid, password: 'alllowercase1' }).success).toBe(false);
    expect(CreateUserSchema.safeParse({ ...valid, password: 'NoNumbersHere' }).success).toBe(false);
  });

  it('rejects an unknown role', () => {
    expect(CreateUserSchema.safeParse({ ...valid, role: 'SUPERADMIN' }).success).toBe(false);
  });
});

describe('UpdateUserSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(UpdateUserSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a partial update', () => {
    expect(UpdateUserSchema.safeParse({ name: 'New Name' }).success).toBe(true);
  });

  it('rejects an invalid locale', () => {
    expect(UpdateUserSchema.safeParse({ locale: 'fr' }).success).toBe(false);
  });

  it('rejects an invalid currency', () => {
    expect(UpdateUserSchema.safeParse({ currency: 'JPY' }).success).toBe(false);
  });

  it('still enforces password complexity when provided', () => {
    expect(UpdateUserSchema.safeParse({ password: 'weak' }).success).toBe(false);
  });
});

describe('ListUsersQuerySchema', () => {
  it('applies defaults when empty (page=1, limit=10)', () => {
    const parsed = ListUsersQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, limit: 10 });
  });

  it('coerces numeric strings', () => {
    expect(ListUsersQuerySchema.parse({ page: '3', limit: '25' })).toEqual({ page: 3, limit: 25 });
  });

  it('caps limit at 100 (rejects above)', () => {
    expect(ListUsersQuerySchema.safeParse({ limit: 200 }).success).toBe(false);
  });

  it('rejects page below 1', () => {
    expect(ListUsersQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('UpdatePreferencesSchema', () => {
  it('accepts valid locale/currency', () => {
    expect(UpdatePreferencesSchema.safeParse({ locale: 'pt', currency: 'USD' }).success).toBe(true);
  });

  it('accepts an empty object', () => {
    expect(UpdatePreferencesSchema.safeParse({}).success).toBe(true);
  });

  it('rejects unsupported locale/currency', () => {
    expect(UpdatePreferencesSchema.safeParse({ locale: 'es' }).success).toBe(false);
    expect(UpdatePreferencesSchema.safeParse({ currency: 'GBP' }).success).toBe(false);
  });
});
