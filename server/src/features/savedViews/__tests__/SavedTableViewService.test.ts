/**
 * SavedTableViewService unit tests — CRUD happy paths + cross-tenant isolation.
 *
 * A view owned by another user must be reported as NotFoundError (never
 * ForbiddenError) to prevent enumeration. ADMIN may act on any view.
 */
import { SavedTableViewService } from '../services/SavedTableViewService';
import { SavedTableViewPolicy } from '../policies/SavedTableViewPolicy';
import type { ISavedTableViewRepository } from '../repositories/ISavedTableViewRepository';
import type { ISavedTableView } from '../models/SavedTableView.model';
import { IUser, Role } from '../../users/models/User.model';
import { NotFoundError } from '../../../lib/errors';

const referenceDate = new Date('2026-06-17T00:00:00.000Z');

const owner: IUser = {
  id: 'user_owner', name: 'Owner', username: 'owner', email: 'owner@x.com',
  role: Role.USER, createdAt: referenceDate, updatedAt: referenceDate,
};
const intruder: IUser = {
  id: 'user_other', name: 'Other', username: 'other', email: 'other@x.com',
  role: Role.USER, createdAt: referenceDate, updatedAt: referenceDate,
};
const admin: IUser = {
  id: 'user_admin', name: 'Admin', username: 'admin', email: 'admin@x.com',
  role: Role.ADMIN, createdAt: referenceDate, updatedAt: referenceDate,
};

const makeView = (over: Partial<ISavedTableView> = {}): ISavedTableView => ({
  id: 'view_1',
  userId: owner.id,
  tableId: 'table_1',
  name: 'My View',
  config: { query: 'acme', fieldFilters: { status: 'open' }, sortConfig: { field: 'name', direction: 'asc' } },
  createdAt: referenceDate,
  updatedAt: referenceDate,
  ...over,
});

function buildService(overrides: Partial<jest.Mocked<ISavedTableViewRepository>> = {}) {
  const repo: jest.Mocked<ISavedTableViewRepository> = {
    create: jest.fn(),
    findManyByUserAndTable: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
    ...overrides,
  };
  const service = new SavedTableViewService(repo, new SavedTableViewPolicy());
  return { service, repo };
}

beforeEach(() => jest.clearAllMocks());

describe('SavedTableViewService', () => {
  it('list returns the actor-scoped views for a table', async () => {
    const { service, repo } = buildService();
    const views = [makeView()];
    repo.findManyByUserAndTable.mockResolvedValue(views);

    const result = await service.list(owner, 'table_1');

    expect(repo.findManyByUserAndTable).toHaveBeenCalledWith(owner.id, 'table_1');
    expect(result).toEqual(views);
  });

  it('create scopes the new view to the actor', async () => {
    const { service, repo } = buildService();
    const created = makeView();
    repo.create.mockResolvedValue(created);

    const dto = { tableId: 'table_1', name: 'My View', config: { query: 'acme' } };
    const result = await service.create(owner, dto);

    expect(repo.create).toHaveBeenCalledWith({
      userId: owner.id,
      tableId: 'table_1',
      name: 'My View',
      config: { query: 'acme' },
    });
    expect(result).toBe(created);
  });

  it('update applies the patch for the owner', async () => {
    const { service, repo } = buildService();
    repo.findById.mockResolvedValue(makeView());
    const updated = makeView({ name: 'Renamed' });
    repo.update.mockResolvedValue(updated);

    const result = await service.update(owner, 'view_1', { name: 'Renamed' });

    expect(repo.update).toHaveBeenCalledWith('view_1', { name: 'Renamed' });
    expect(result.name).toBe('Renamed');
  });

  it('delete soft-deletes the owner view', async () => {
    const { service, repo } = buildService();
    repo.findById.mockResolvedValue(makeView());

    await service.delete(owner, 'view_1');

    expect(repo.softDelete).toHaveBeenCalledWith('view_1');
  });

  it('ADMIN may update any user view', async () => {
    const { service, repo } = buildService();
    repo.findById.mockResolvedValue(makeView({ userId: owner.id }));
    repo.update.mockResolvedValue(makeView({ name: 'AdminEdit' }));

    const result = await service.update(admin, 'view_1', { name: 'AdminEdit' });

    expect(result.name).toBe('AdminEdit');
    expect(repo.update).toHaveBeenCalled();
  });

  it('update of another user view throws NotFoundError (no enumeration leak)', async () => {
    const { service, repo } = buildService();
    repo.findById.mockResolvedValue(makeView({ userId: owner.id }));

    await expect(service.update(intruder, 'view_1', { name: 'X' })).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('delete of another user view throws NotFoundError and does not soft-delete', async () => {
    const { service, repo } = buildService();
    repo.findById.mockResolvedValue(makeView({ userId: owner.id }));

    await expect(service.delete(intruder, 'view_1')).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('update of a missing view throws NotFoundError', async () => {
    const { service, repo } = buildService();
    repo.findById.mockResolvedValue(null);

    await expect(service.update(owner, 'view_x', { name: 'X' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
