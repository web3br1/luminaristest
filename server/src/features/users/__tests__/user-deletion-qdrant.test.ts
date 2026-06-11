/**
 * Security/Privacy regression test: Qdrant vector deletion ordering (R5)
 *
 * LGPD art.18 VI — right to erasure: vectors stored in Qdrant must be purged
 * BEFORE the user row is removed from SQL.  If Qdrant fails the SQL delete
 * must NOT execute, leaving the record intact for retry.
 *
 * Verified behaviours
 * -------------------
 * 1. deleteVectorsByUserId is called during deleteUser.
 * 2. deleteVectorsByUserId is called BEFORE deleteUser (ordering).
 * 3. If deleteVectorsByUserId rejects, deleteUser is NOT called.
 */

import { UserService } from '../services/UserService';
import { Role } from '../models/User.model';

// ---------------------------------------------------------------------------
// Silence logger output during tests
// ---------------------------------------------------------------------------
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------
const USER_ID = 'user-abc-123';

const ACTOR = {
  id: 'admin-001',
  username: 'admin',
  email: 'admin@example.com',
  name: 'Admin',
  password: 'hashed',
  role: Role.ADMIN,
  locale: 'en',
  currency: 'USD',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const EXISTING_USER = {
  id: USER_ID,
  username: 'alice',
  email: 'alice@example.com',
  name: 'Alice',
  role: Role.USER,
  locale: 'en',
  currency: 'USD',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Helper — build a UserService with controllable mocks
// ---------------------------------------------------------------------------
function buildService(overrides: {
  deleteVectorsByUserId?: jest.Mock;
  deleteUser?: jest.Mock;
}) {
  const deleteVectorsByUserId = overrides.deleteVectorsByUserId ?? jest.fn().mockResolvedValue(undefined);
  const deleteUser = overrides.deleteUser ?? jest.fn().mockResolvedValue(EXISTING_USER);

  const mockUserRepository = {
    getUserById: jest.fn().mockResolvedValue(EXISTING_USER),
    deleteUser,
    createUser: jest.fn(),
    getAllUsers: jest.fn(),
    getUserByUsername: jest.fn(),
    getUserByEmail: jest.fn(),
    updateUser: jest.fn(),
    convertRole: jest.fn(),
  };

  const mockUserPolicy = {
    canDelete: jest.fn().mockReturnValue(true),
    canCreate: jest.fn(),
    canListAll: jest.fn(),
    canView: jest.fn(),
    canUpdate: jest.fn(),
    canChangeRole: jest.fn(),
  };

  const mockVectorRepository = {
    deleteVectorsByUserId,
    upsertChunks: jest.fn(),
    search: jest.fn(),
    searchVectors: jest.fn(),
    deletePoints: jest.fn(),
    getPointsByDocumentId: jest.fn(),
  };

  const service = new UserService(
    mockUserRepository as any,
    mockUserPolicy as any,
    mockVectorRepository as any,
  );

  return { service, mockUserRepository, mockVectorRepository, deleteVectorsByUserId, deleteUser };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserService.deleteUser — Qdrant ordering (R5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls deleteVectorsByUserId during user deletion', async () => {
    const { service, deleteVectorsByUserId } = buildService({});

    await service.deleteUser(USER_ID, ACTOR);

    expect(deleteVectorsByUserId).toHaveBeenCalledTimes(1);
    expect(deleteVectorsByUserId).toHaveBeenCalledWith(USER_ID);
  });

  it('calls deleteVectorsByUserId BEFORE deleteUser (ordering)', async () => {
    const callOrder: string[] = [];

    const deleteVectorsByUserId = jest.fn().mockImplementation(async () => {
      callOrder.push('deleteVectorsByUserId');
    });
    const deleteUser = jest.fn().mockImplementation(async () => {
      callOrder.push('deleteUser');
      return EXISTING_USER;
    });

    const { service } = buildService({ deleteVectorsByUserId, deleteUser });

    await service.deleteUser(USER_ID, ACTOR);

    expect(callOrder).toEqual(['deleteVectorsByUserId', 'deleteUser']);
    expect(callOrder.indexOf('deleteVectorsByUserId')).toBeLessThan(
      callOrder.indexOf('deleteUser'),
    );
  });

  it('does NOT call deleteUser when deleteVectorsByUserId rejects', async () => {
    const qdrantError = new Error('Qdrant connection refused');

    const deleteVectorsByUserId = jest.fn().mockRejectedValue(qdrantError);
    const deleteUser = jest.fn().mockResolvedValue(EXISTING_USER);

    const { service } = buildService({ deleteVectorsByUserId, deleteUser });

    await expect(service.deleteUser(USER_ID, ACTOR)).rejects.toThrow(qdrantError);

    expect(deleteVectorsByUserId).toHaveBeenCalledTimes(1);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});
