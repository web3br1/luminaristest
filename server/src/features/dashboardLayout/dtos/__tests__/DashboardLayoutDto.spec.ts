/**
 * Unit tests for the dashboardLayout DTOs (Zod boundary) — pure, no I/O.
 * Locks the name bounds, the type enum, the config shape (columns 1–12), and the partial-update shape.
 */
import {
  CreateDashboardLayoutSchema,
  UpdateDashboardLayoutSchema,
} from '../DashboardLayoutDto';
import { LayoutType } from '../../models/DashboardLayout.model';

describe('CreateDashboardLayoutSchema', () => {
  const valid = { name: 'My Tab', type: LayoutType.GRID, config: { columns: 2, widgets: [] } };

  it('accepts a valid payload', () => {
    expect(CreateDashboardLayoutSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a too-short name (<3)', () => {
    expect(CreateDashboardLayoutSchema.safeParse({ ...valid, name: 'ab' }).success).toBe(false);
  });

  it('rejects a too-long name (>50)', () => {
    expect(CreateDashboardLayoutSchema.safeParse({ ...valid, name: 'x'.repeat(51) }).success).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(CreateDashboardLayoutSchema.safeParse({ ...valid, type: 'KANBAN' }).success).toBe(false);
  });

  it('rejects columns outside 1..12', () => {
    expect(CreateDashboardLayoutSchema.safeParse({ ...valid, config: { columns: 0, widgets: [] } }).success).toBe(false);
    expect(CreateDashboardLayoutSchema.safeParse({ ...valid, config: { columns: 13, widgets: [] } }).success).toBe(false);
  });

  it('rejects a missing config', () => {
    const { config, ...rest } = valid;
    expect(CreateDashboardLayoutSchema.safeParse(rest).success).toBe(false);
  });
});

describe('UpdateDashboardLayoutSchema (partial)', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(UpdateDashboardLayoutSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a name-only update', () => {
    expect(UpdateDashboardLayoutSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });

  it('still validates a provided field (bad type rejected)', () => {
    expect(UpdateDashboardLayoutSchema.safeParse({ type: 'NOPE' }).success).toBe(false);
  });
});
