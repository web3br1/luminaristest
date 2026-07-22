/**
 * Integration tests for DashboardLayoutService — real SQLite with the real repository + policy.
 *
 * Covers the feature's integrity invariants exhaustively: exactly ONE active layout per user
 * (transactional setActive), merge-on-update (a partial PATCH never wipes type/config), fail-soft
 * listing (a malformed row is skipped, not fatal), delete-active reassignment, the per-user cap, and
 * Tier-0 ownership.
 *
 * Run via `npm run test:integration`.
 */
import { DashboardLayoutService } from '../DashboardLayoutService';
import { DashboardLayoutRepository } from '../../repositories/DashboardLayoutRepository';
import { DashboardLayoutPolicy } from '../../policies/DashboardLayoutPolicy';
import { LayoutType } from '../../models/DashboardLayout.model';
import { Role } from '../../../users/models/User.model';
import { ForbiddenError, NotFoundError, ValidationError, ServiceError, UnauthorizedError } from '@/lib/errors';
import {
  pushTestSchema,
  resetDb,
  disconnectDb,
  seedUser,
  seedDashboardLayout,
  ctxFor,
} from '@test/helpers';

const service = new DashboardLayoutService(new DashboardLayoutRepository(), new DashboardLayoutPolicy());

const CONFIG = { columns: 2, widgets: [] as string[] };
const dto = (name: string) => ({ name, type: LayoutType.GRID, config: CONFIG });

beforeAll(() => {
  pushTestSchema();
}, 120000);

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('createLayout', () => {
  it('creates a layout and makes it the active one', async () => {
    const u = await seedUser({ username: 'u' });
    const created = await service.createLayout(dto('Tab A'), ctxFor({ id: u.id, username: u.username }));
    expect(created.isActive).toBe(true);
    expect(created.name).toBe('Tab A');
  });

  it('enforces exactly ONE active layout per user (creating a second deactivates the first)', async () => {
    const u = await seedUser({ username: 'u' });
    const ctx = ctxFor({ id: u.id, username: u.username });
    const a = await service.createLayout(dto('A'), ctx);
    const b = await service.createLayout(dto('B'), ctx);

    const layouts = await service.getLayoutsByUser(ctx);
    const actives = layouts.filter((l) => l.isActive);
    expect(actives).toHaveLength(1);
    expect(actives[0].id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  it('throws ValidationError when the per-user cap is reached', async () => {
    const u = await seedUser({ username: 'u' });
    // Seed the maximum (20) directly, then the next create must be rejected.
    for (let i = 0; i < 20; i++) await seedDashboardLayout({ userId: u.id, name: `Tab ${i}` });
    await expect(service.createLayout(dto('overflow'), ctxFor({ id: u.id, username: u.username }))).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('throws UnauthorizedError without a userId', async () => {
    const ctx = { ...ctxFor({ id: 'x', username: 'x' }), userId: '' };
    await expect(service.createLayout(dto('x'), ctx)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('updateLayout (merge-on-update)', () => {
  it('a name-only update preserves the stored type and config', async () => {
    const u = await seedUser({ username: 'u' });
    const ctx = ctxFor({ id: u.id, username: u.username });
    const created = await service.createLayout(
      { name: 'Original', type: LayoutType.LIST, config: { columns: 3, widgets: ['w1'] } },
      ctx
    );

    const updated = await service.updateLayout(created.id, { name: 'Renamed' }, ctx);

    expect(updated.name).toBe('Renamed');
    expect(updated.type).toBe(LayoutType.LIST); // not wiped
    expect(updated.config.columns).toBe(3); // not wiped
    expect(updated.config.widgets).toEqual(['w1']);
  });

  it('forbids another USER from updating (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const l = await seedDashboardLayout({ userId: owner.id });
    await expect(
      service.updateLayout(l.id, { name: 'Hacked' }, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('lets an ADMIN update another user layout', async () => {
    const owner = await seedUser({ username: 'owner' });
    const l = await seedDashboardLayout({ userId: owner.id, name: 'Old' });
    const updated = await service.updateLayout(
      l.id,
      { name: 'By Admin' },
      ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN })
    );
    expect(updated.name).toBe('By Admin');
  });
});

describe('setActiveLayout', () => {
  it('switches the active tab to the chosen layout', async () => {
    const u = await seedUser({ username: 'u' });
    const ctx = ctxFor({ id: u.id, username: u.username });
    const a = await service.createLayout(dto('A'), ctx);
    await service.createLayout(dto('B'), ctx); // B is active now

    await service.setActiveLayout(a.id, ctx);

    const layouts = await service.getLayoutsByUser(ctx);
    const actives = layouts.filter((l) => l.isActive);
    expect(actives).toHaveLength(1);
    expect(actives[0].id).toBe(a.id);
  });

  it('forbids switching to another user layout (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const l = await seedDashboardLayout({ userId: owner.id });
    await expect(
      service.setActiveLayout(l.id, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('deleteLayout', () => {
  it('promotes a remaining layout to active when the deleted one was active', async () => {
    const u = await seedUser({ username: 'u' });
    const ctx = ctxFor({ id: u.id, username: u.username });
    const a = await service.createLayout(dto('A'), ctx);
    const b = await service.createLayout(dto('B'), ctx); // B active

    await service.deleteLayout(b.id, ctx);

    const layouts = await service.getLayoutsByUser(ctx);
    expect(layouts).toHaveLength(1);
    expect(layouts[0].id).toBe(a.id);
    expect(layouts[0].isActive).toBe(true); // A promoted to active
  });

  it('forbids deleting another user layout (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const l = await seedDashboardLayout({ userId: owner.id });
    await expect(
      service.deleteLayout(l.id, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError for a missing layout', async () => {
    const u = await seedUser({ username: 'u' });
    await expect(
      service.deleteLayout('cl00000000000000000000000', ctxFor({ id: u.id, username: u.username }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getLayoutById / getLayoutsByUser (Tier-0 + fail-soft)', () => {
  it('forbids reading another user layout (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const l = await seedDashboardLayout({ userId: owner.id });
    await expect(
      service.getLayoutById(l.id, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('fail-soft list: a malformed row is skipped, the valid ones are still returned', async () => {
    const u = await seedUser({ username: 'u' });
    await seedDashboardLayout({ userId: u.id, name: 'Good' });
    // Malformed: layoutData missing `type` → mapToDomain throws, must be skipped by the list.
    await seedDashboardLayout({ userId: u.id, name: 'Broken', layoutData: { config: { columns: 1, widgets: [] } } });

    const layouts = await service.getLayoutsByUser(ctxFor({ id: u.id, username: u.username }));
    expect(layouts).toHaveLength(1);
    expect(layouts[0].name).toBe('Good');
  });

  it('but a single-record read of a malformed layout surfaces the ServiceError', async () => {
    const u = await seedUser({ username: 'u' });
    const broken = await seedDashboardLayout({
      userId: u.id,
      layoutData: { config: { columns: 1, widgets: [] } },
    });
    await expect(
      service.getLayoutById(broken.id, ctxFor({ id: u.id, username: u.username }))
    ).rejects.toBeInstanceOf(ServiceError);
  });
});
