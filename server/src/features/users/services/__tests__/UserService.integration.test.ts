/**
 * Integration tests for UserService — business rules against a REAL SQLite DB, with the real
 * UserRepository, UserPolicy and bcrypt (no mocks). Covers what the policy unit test can't:
 * Tier-0 (a USER only touches themselves), uniqueness conflicts, the last-admin guards, password
 * hashing and the typed-error contract.
 *
 * Run via `npm run test:integration`.
 */
import bcrypt from 'bcryptjs';
import { UserService } from '../UserService';
import { UserRepository } from '../../repositories/UserRepository';
import { VectorRepository } from '@/features/documents/repositories/VectorRepository';
import { UserPolicy } from '../../policies/UserPolicy';
import { Role } from '../../models/User.model';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
} from '@/lib/errors';
import { pushTestSchema, resetDb, disconnectDb, seedUser, ctxFor } from '@test/helpers';

const repo = new UserRepository();
const service = new UserService(repo, new UserPolicy(), new VectorRepository());

beforeAll(() => {
  pushTestSchema();
}, 120000);

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('createUser', () => {
  it('public signup creates a USER and never returns the password', async () => {
    const created = await service.createUser(
      { username: 'alice', email: 'alice@test.co', password: 'Passw0rd' },
      null
    );
    expect(created.role).toBe(Role.USER);
    expect(created).not.toHaveProperty('password');
  });

  it('hashes the password (stored value is a bcrypt hash, not plaintext)', async () => {
    await service.createUser(
      { username: 'bob', email: 'bob@test.co', password: 'Passw0rd' },
      null
    );
    const stored = await repo.getUserByUsername('bob');
    expect(stored!.password).not.toBe('Passw0rd');
    expect(await bcrypt.compare('Passw0rd', stored!.password)).toBe(true);
  });

  it('downgrades a public signup that asks for ADMIN to USER', async () => {
    const created = await service.createUser(
      { username: 'sneaky', email: 'sneaky@test.co', password: 'Passw0rd', role: Role.ADMIN },
      null
    );
    expect(created.role).toBe(Role.USER);
  });

  it('lets an ADMIN actor create an ADMIN', async () => {
    const admin = ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN });
    const created = await service.createUser(
      { username: 'newadmin', email: 'newadmin@test.co', password: 'Passw0rd', role: Role.ADMIN },
      admin
    );
    expect(created.role).toBe(Role.ADMIN);
  });

  it('forbids a regular USER from creating users', async () => {
    const user = ctxFor({ id: 'user-1', username: 'joe', role: Role.USER });
    await expect(
      service.createUser({ username: 'x', email: 'x@test.co', password: 'Passw0rd' }, user)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a duplicate username with ConflictError', async () => {
    await seedUser({ username: 'dupe', email: 'first@test.co' });
    await expect(
      service.createUser({ username: 'dupe', email: 'second@test.co', password: 'Passw0rd' }, null)
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a duplicate email with ConflictError', async () => {
    await seedUser({ username: 'first', email: 'taken@test.co' });
    await expect(
      service.createUser({ username: 'second', email: 'taken@test.co', password: 'Passw0rd' }, null)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('getAllUsers', () => {
  it('returns the list (no passwords) for an ADMIN', async () => {
    await seedUser({ username: 'a' });
    await seedUser({ username: 'b' });
    const admin = ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN });

    const { users, totalCount } = await service.getAllUsers(admin, 1, 10);
    expect(totalCount).toBe(2);
    for (const u of users) expect(u).not.toHaveProperty('password');
  });

  it('forbids a regular USER', async () => {
    const user = ctxFor({ id: 'user-1', username: 'joe', role: Role.USER });
    await expect(service.getAllUsers(user)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('forbids an unauthenticated caller', async () => {
    await expect(service.getAllUsers(null)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('getUserById (Tier-0)', () => {
  it('lets a USER read their OWN profile', async () => {
    const u = await seedUser({ username: 'self' });
    const ctx = ctxFor({ id: u.id, username: u.username, role: Role.USER });
    const got = await service.getUserById(u.id, ctx);
    expect(got.id).toBe(u.id);
    expect(got).not.toHaveProperty('password');
  });

  it('forbids a USER from reading ANOTHER user (cross-tenant)', async () => {
    const other = await seedUser({ username: 'other' });
    const ctx = ctxFor({ id: 'user-1', username: 'joe', role: Role.USER });
    await expect(service.getUserById(other.id, ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets an ADMIN read anyone', async () => {
    const u = await seedUser({ username: 'target' });
    const admin = ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN });
    const got = await service.getUserById(u.id, admin);
    expect(got.username).toBe('target');
  });

  it('throws NotFoundError when the user does not exist', async () => {
    const admin = ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN });
    await expect(service.getUserById('cl00000000000000000000000', admin)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe('updateUser', () => {
  it('throws UnauthorizedError without an actor', async () => {
    const u = await seedUser({ username: 'u' });
    await expect(service.updateUser(u.id, { name: 'New' }, null)).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it('lets a USER update their own name (Tier-0)', async () => {
    const u = await seedUser({ username: 'self', name: 'Old' });
    const ctx = ctxFor({ id: u.id, username: u.username, role: Role.USER });
    const updated = await service.updateUser(u.id, { name: 'New' }, ctx);
    expect(updated.name).toBe('New');
  });

  it('forbids a USER from updating ANOTHER user (cross-tenant)', async () => {
    const other = await seedUser({ username: 'other' });
    const ctx = ctxFor({ id: 'user-1', username: 'joe', role: Role.USER });
    await expect(service.updateUser(other.id, { name: 'Hacked' }, ctx)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it('forbids a USER from changing their own role', async () => {
    const u = await seedUser({ username: 'self', role: Role.USER });
    const ctx = ctxFor({ id: u.id, username: u.username, role: Role.USER });
    await expect(service.updateUser(u.id, { role: Role.ADMIN }, ctx)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it('hashes a new password on update', async () => {
    const u = await seedUser({ username: 'self' });
    const ctx = ctxFor({ id: u.id, username: u.username, role: Role.USER });
    await service.updateUser(u.id, { password: 'NewPass1' }, ctx);
    const stored = await repo.getUserByUsername('self');
    expect(await bcrypt.compare('NewPass1', stored!.password)).toBe(true);
  });

  it('rejects an empty update with ValidationError', async () => {
    const u = await seedUser({ username: 'self' });
    const ctx = ctxFor({ id: u.id, username: u.username, role: Role.USER });
    await expect(service.updateUser(u.id, {}, ctx)).rejects.toBeInstanceOf(ValidationError);
  });

  it('blocks demoting the LAST admin (ValidationError)', async () => {
    const admin = await seedUser({ username: 'root', role: Role.ADMIN });
    const ctx = ctxFor({ id: admin.id, username: admin.username, role: Role.ADMIN });
    await expect(service.updateUser(admin.id, { role: Role.USER }, ctx)).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('allows demoting an admin when another admin remains', async () => {
    const admin1 = await seedUser({ username: 'root1', role: Role.ADMIN });
    await seedUser({ username: 'root2', role: Role.ADMIN });
    const ctx = ctxFor({ id: admin1.id, username: admin1.username, role: Role.ADMIN });
    const updated = await service.updateUser(admin1.id, { role: Role.USER }, ctx);
    expect(updated.role).toBe(Role.USER);
  });

  it('lets an ADMIN update ANOTHER user', async () => {
    const target = await seedUser({ username: 'target', name: 'Old' });
    const admin = ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN });
    const updated = await service.updateUser(target.id, { name: 'By Admin' }, admin);
    expect(updated.name).toBe('By Admin');
  });

  it('lets an ADMIN promote a USER to ADMIN', async () => {
    const target = await seedUser({ username: 'target', role: Role.USER });
    const admin = ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN });
    const updated = await service.updateUser(target.id, { role: Role.ADMIN }, admin);
    expect(updated.role).toBe(Role.ADMIN);
  });
});

describe('deleteUser', () => {
  it('throws UnauthorizedError without an actor', async () => {
    const u = await seedUser({ username: 'u' });
    await expect(service.deleteUser(u.id, null)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('forbids a USER from deleting THEMSELVES (admin-only lifecycle)', async () => {
    const u = await seedUser({ username: 'self' });
    const ctx = ctxFor({ id: u.id, username: u.username, role: Role.USER });
    await expect(service.deleteUser(u.id, ctx)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await repo.getUserById(u.id)).not.toBeNull(); // still there
  });

  it('forbids a USER from deleting ANOTHER user', async () => {
    const other = await seedUser({ username: 'other' });
    const ctx = ctxFor({ id: 'user-1', username: 'joe', role: Role.USER });
    await expect(service.deleteUser(other.id, ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets an ADMIN delete another user', async () => {
    await seedUser({ username: 'root', role: Role.ADMIN }); // keep an admin so the guard is not triggered
    const victim = await seedUser({ username: 'victim' });
    const admin = ctxFor({ id: 'admin-x', username: 'root2', role: Role.ADMIN });
    await expect(service.deleteUser(victim.id, admin)).resolves.toBeUndefined();
    expect(await repo.getUserById(victim.id)).toBeNull();
  });

  it('blocks deleting the LAST admin (ValidationError)', async () => {
    const admin = await seedUser({ username: 'root', role: Role.ADMIN });
    const ctx = ctxFor({ id: admin.id, username: admin.username, role: Role.ADMIN });
    await expect(service.deleteUser(admin.id, ctx)).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws NotFoundError for a missing user', async () => {
    const admin = ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN });
    await expect(service.deleteUser('cl00000000000000000000000', admin)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe('updatePreferences', () => {
  it('updates locale/currency for the given user', async () => {
    const u = await seedUser({ username: 'self' });
    const updated = await service.updatePreferences(u.id, { locale: 'pt', currency: 'USD' });
    expect(updated.locale).toBe('pt');
    expect(updated.currency).toBe('USD');
  });
});

describe('authenticate', () => {
  // Create via the service so the password is really hashed (seedUser stores a non-hash).
  const register = () =>
    service.createUser({ username: 'alice', email: 'alice@test.co', password: 'Passw0rd' }, null);

  it('returns the safe profile (no password) for valid username + password', async () => {
    await register();
    const profile = await service.authenticate('alice', 'Passw0rd');
    expect(profile.username).toBe('alice');
    expect(profile).not.toHaveProperty('password');
  });

  it('also authenticates by email', async () => {
    await register();
    const profile = await service.authenticate('alice@test.co', 'Passw0rd');
    expect(profile.username).toBe('alice');
  });

  it('rejects a wrong password with UnauthorizedError', async () => {
    await register();
    await expect(service.authenticate('alice', 'WrongPass1')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an unknown identifier with UnauthorizedError', async () => {
    await expect(service.authenticate('ghost', 'whatever')).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
