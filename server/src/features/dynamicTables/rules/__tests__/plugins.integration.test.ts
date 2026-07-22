/**
 * Exhaustive integration coverage for the dynamicTables RULE PLUGINS.
 *
 * Companion to DynamicTableService.integration.test.ts (which locks the engine/governance). Here we
 * drive each registered plugin through the REAL service write path (prisma.$transaction + the rule
 * hooks), one describe block per plugin, with a test that fails if the rule breaks.
 *
 * Fixture strategy (right-sized, per backend-scope): each plugin is exercised with the MINIMAL set of
 * tables it detects (correct `category` + `internalName`), declaring only the fields the plugin reads
 * — Zod strips unknown keys, so a field a plugin reads must be in the table schema. Id-bearing fields
 * (unitId, productId, saleId, …) are declared as plain `string` (not `relation`) to read as written
 * without pulling relation-existence validation; real relation/cascade behavior is covered in the
 * engine suite.
 *
 * Deliberately scoped OUT (covered when we review the Sales preset ERP, which is their real fixture):
 * SalesPlugin's deep cross-table side-effects on finalize — stock application (stockSync), commission
 * materialization, customer revenue metrics, appointment auto-create. Those require the full
 * interlocking inventory/customer/appointment/commission tables. The SalesPlugin LOGIC that is
 * independent of that wiring (header guards, sale-item XOR/no-mix, parent-finalized guard) IS covered.
 *
 * Run via `npm run test:integration`.
 */
import prisma from '@/lib/prisma';
import { pushTestSchema, resetDb, disconnectDb } from '@test/helpers';
import { DynamicTableRepository } from '@/features/dynamicTables/repositories/DynamicTableRepository';
import { DynamicTablePolicy } from '@/features/dynamicTables/policies/DynamicTablePolicy';
import { DynamicTableService } from '@/features/dynamicTables/services/DynamicTableService';
import { Role } from '@/features/users/models/User.model';
import { ValidationError } from '@/lib/errors';
import type { UserContext } from '@/lib/authUtils';

// Constructing the service imports RuleRegistry, which registers the 10 real plugins.
const service = new DynamicTableService(new DynamicTableRepository(), new DynamicTablePolicy());

const USER = 'owner';

function ctx(): UserContext {
  return { id: USER, userId: USER, name: 'u', username: USER, email: 'u@test.co', userEmail: 'u@test.co', role: Role.USER, userRole: Role.USER, createdAt: new Date(), updatedAt: new Date() };
}

/** Field shorthand: f('amount', 'number', true). */
function f(name: string, type: string, required = false, extra: Record<string, unknown> = {}) {
  return { name, label: name, type, required, ...extra };
}

async function seedTbl(opts: { name: string; internalName: string; category: string; fields: unknown[]; extra?: Record<string, unknown> }) {
  return service.createTableAsSystem(USER, {
    name: opts.name,
    category: opts.category,
    internalName: opts.internalName,
    schema: { fields: opts.fields, ...(opts.extra ?? {}) },
  } as any);
}

const create = (tableId: string, data: Record<string, unknown>) => service.createTableData(ctx(), tableId, { data } as any);
const update = (dataId: string, data: Record<string, unknown>) => service.updateTableData(ctx(), dataId, { data } as any);
const rowsOf = (tableId: string) => prisma.dynamicTableData.findMany({ where: { dynamicTableId: tableId, deletedAt: null } });
const rowById = (id: string) => prisma.dynamicTableData.findUnique({ where: { id } });

beforeAll(() => {
  pushTestSchema();
}, 120000);

beforeEach(async () => {
  await prisma.user.create({ data: { id: USER, username: USER, email: 'u@test.co', password: 'x', role: Role.USER } });
});

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

// ---------------------------------------------------------------------------------------------
describe('GoalsPlugin — auto-computes result from actual vs target', () => {
  const fields = [
    f('name', 'string', true),
    f('targetAmount', 'number'),
    f('actualAmount', 'number'),
    f('result', 'string'),
    f('endDate', 'date'),
  ];
  it('marks Reached when actual >= target', async () => {
    const t = await seedTbl({ name: 'Goals', internalName: 'goals', category: 'operations', fields });
    const r = await create(t.id, { name: 'G', targetAmount: 100, actualAmount: 100 });
    expect((r.data as any).result).toBe('Reached');
  });
  it('marks Partial when actual is between 50% and 100%', async () => {
    const t = await seedTbl({ name: 'Goals', internalName: 'goals', category: 'operations', fields });
    const r = await create(t.id, { name: 'G', targetAmount: 100, actualAmount: 60 });
    expect((r.data as any).result).toBe('Partial');
  });
});

// ---------------------------------------------------------------------------------------------
describe('CommissionsPlugin — stamps paidAt when entering Paid', () => {
  const fields = [
    f('status', 'select', true, { options: ['Pending', 'Paid', 'Cancelled'] }),
    f('amount', 'number', true),
    f('paidAt', 'string'),
  ];
  it('stamps paidAt on create with status Paid', async () => {
    const t = await seedTbl({ name: 'Commissions', internalName: 'commissions', category: 'finance', fields });
    const r = await create(t.id, { status: 'Paid', amount: 100 });
    expect((r.data as any).paidAt).toBeTruthy();
  });
  it('stamps paidAt on transition Pending -> Paid', async () => {
    const t = await seedTbl({ name: 'Commissions', internalName: 'commissions', category: 'finance', fields });
    const r = await create(t.id, { status: 'Pending', amount: 100 });
    expect((r.data as any).paidAt).toBeFalsy();
    const u = await update(r.id, { status: 'Paid' });
    expect((u.data as any).paidAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
describe('EmployeesPlugin — operational readiness validation', () => {
  const fields = [
    f('name', 'string', true),
    f('email', 'string'),
    f('unitId', 'string'),
    f('workSchedule', 'json'),
  ];
  const seed = () => seedTbl({ name: 'Employees', internalName: 'employees', category: 'people', fields });

  it('rejects an employee with neither a unit nor a work day', async () => {
    const t = await seed();
    await expect(create(t.id, { name: 'E' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects an employee without an email', async () => {
    const t = await seed();
    await expect(create(t.id, { name: 'E', unitId: 'u1' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('accepts an employee with a unit and an email', async () => {
    const t = await seed();
    await expect(create(t.id, { name: 'E', unitId: 'u1', email: 'e@x.co' })).resolves.toBeTruthy();
  });
  it('rejects an incomplete work-day (start without end)', async () => {
    const t = await seed();
    await expect(
      create(t.id, { name: 'E', email: 'e@x.co', workSchedule: { monday: { start: '09:00', end: '17:00' }, tuesday: { start: '09:00' } } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects a work-day whose end is before its start', async () => {
    const t = await seed();
    await expect(
      create(t.id, { name: 'E', email: 'e@x.co', workSchedule: { monday: { start: '17:00', end: '09:00' } } }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// ---------------------------------------------------------------------------------------------
describe('AppointmentsPlugin — scheduling rules vs the clock', () => {
  const fields = [
    f('startAt', 'datetime', true),
    f('endAt', 'datetime', true),
    f('customerId', 'string'),
    f('simpleCustomer', 'boolean'),
    f('simpleCustomerName', 'string'),
    f('status', 'select', false, { options: ['Scheduled', 'Completed', 'Cancelled', 'No-Show'] }),
  ];
  const seed = () => seedTbl({ name: 'Appointments', internalName: 'appointments', category: 'planning', fields });
  const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

  it('rejects a booking in the past', async () => {
    const t = await seed();
    await expect(
      create(t.id, { startAt: '2000-01-01T10:00:00Z', endAt: '2000-01-01T11:00:00Z', simpleCustomer: true, simpleCustomerName: 'J' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects a booking more than 5 years ahead', async () => {
    const t = await seed();
    await expect(
      create(t.id, { startAt: future(366 * 6), endAt: future(366 * 6), simpleCustomer: true, simpleCustomerName: 'J' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects a booking with no customer (relational or simple)', async () => {
    const t = await seed();
    await expect(create(t.id, { startAt: future(2), endAt: future(2) })).rejects.toBeInstanceOf(ValidationError);
  });
  it('accepts a valid future booking with a simple customer', async () => {
    const t = await seed();
    await expect(
      create(t.id, { startAt: future(2), endAt: future(3), simpleCustomer: true, simpleCustomerName: 'John' }),
    ).resolves.toBeTruthy();
  });
  it('forbids completing an appointment that has not ended yet', async () => {
    const t = await seed();
    const appt = await create(t.id, { startAt: future(2), endAt: future(3), simpleCustomer: true, simpleCustomerName: 'John', status: 'Scheduled' });
    await expect(update(appt.id, { status: 'Completed' })).rejects.toBeInstanceOf(ValidationError);
  });
});

// ---------------------------------------------------------------------------------------------
describe('LeadsPlugin — lead coherence, defaults, transitions, score, snapshot', () => {
  const leadFields = [
    f('name', 'string', true),
    f('unitId', 'string'),
    f('pipelineId', 'string'),
    f('stageId', 'string'),
    f('bantBudget', 'string'),
    f('bantAuthority', 'string'),
    f('bantNeed', 'string'),
    f('bantTiming', 'string'),
    f('score', 'number'),
    f('nextActionAt', 'datetime'),
    f('latestProposalAmount', 'number'),
    f('latestProposalCurrency', 'string'),
    f('latestProposalWinProbability', 'number'),
  ];
  const pipeFields = [f('name', 'string', true), f('unitId', 'string'), f('isDefault', 'boolean')];
  const stageFields = [f('name', 'string', true), f('pipelineId', 'string'), f('order', 'number'), f('type', 'string'), f('defaultWinProbability', 'number')];
  const proposalFields = [f('leadId', 'string'), f('amount', 'number'), f('currency', 'string'), f('winProbability', 'number'), f('estimatedCloseDate', 'date'), f('status', 'string')];
  const activityFields = [f('leadId', 'string'), f('type', 'string'), f('message', 'string'), f('payload', 'json')];

  async function seedLeadModule() {
    const leads = await seedTbl({ name: 'Leads', internalName: 'leads', category: 'leads', fields: leadFields });
    const pipelines = await seedTbl({ name: 'Lead Pipelines', internalName: 'leadPipelines', category: 'leads', fields: pipeFields });
    const stages = await seedTbl({ name: 'Lead Stages', internalName: 'leadStages', category: 'leads', fields: stageFields });
    const proposals = await seedTbl({ name: 'Lead Proposals', internalName: 'leadProposals', category: 'leads', fields: proposalFields });
    await seedTbl({ name: 'Lead Activities', internalName: 'leadActivities', category: 'leads', fields: activityFields });
    const pipe = await create(pipelines.id, { name: 'P', unitId: 'u1', isDefault: true });
    const s1 = await create(stages.id, { name: 'S1', pipelineId: pipe.id, order: 1, type: 'init' });
    const s2 = await create(stages.id, { name: 'S2', pipelineId: pipe.id, order: 2, type: 'qualification' });
    const s3 = await create(stages.id, { name: 'S3', pipelineId: pipe.id, order: 3, type: 'proposal' });
    return { leads, proposals, pipe, s1, s2, s3 };
  }

  it('requires a unit on the lead', async () => {
    const { leads } = await seedLeadModule();
    await expect(create(leads.id, { name: 'L' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('fills the first stage of the pipeline when stageId is omitted', async () => {
    const { leads, pipe, s1 } = await seedLeadModule();
    const lead = await create(leads.id, { name: 'L', unitId: 'u1', pipelineId: pipe.id });
    expect((lead.data as any).stageId).toBe(s1.id);
  });
  it('computes a BANT score (all High/Urgent -> 100)', async () => {
    const { leads, pipe, s1 } = await seedLeadModule();
    const lead = await create(leads.id, {
      name: 'L', unitId: 'u1', pipelineId: pipe.id, stageId: s1.id,
      bantBudget: 'high', bantAuthority: 'high', bantNeed: 'high', bantTiming: 'urgent',
    });
    expect((lead.data as any).score).toBe(100);
  });
  it('forbids skipping a stage and allows advancing one step', async () => {
    const { leads, pipe, s1, s2, s3 } = await seedLeadModule();
    const lead = await create(leads.id, { name: 'L', unitId: 'u1', pipelineId: pipe.id, stageId: s1.id });
    await expect(update(lead.id, { stageId: s3.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(update(lead.id, { stageId: s2.id })).resolves.toBeTruthy();
  });
  it('snapshots the latest proposal onto the lead', async () => {
    const { leads, proposals, pipe, s1 } = await seedLeadModule();
    const lead = await create(leads.id, { name: 'L', unitId: 'u1', pipelineId: pipe.id, stageId: s1.id });
    await create(proposals.id, { leadId: lead.id, amount: 500, currency: 'BRL', winProbability: 50 });
    const refreshed = await rowById(lead.id);
    expect((refreshed!.data as any).latestProposalAmount).toBe(500);
  });
});

// ---------------------------------------------------------------------------------------------
describe('LeadsSeedOnUnitPlugin — seeds a default pipeline + stages on unit creation', () => {
  it('creates a default pipeline and 4 stages for the new unit', async () => {
    const pipelines = await seedTbl({ name: 'Lead Pipelines', internalName: 'leadPipelines', category: 'leads', fields: [f('name', 'string', true), f('unitId', 'string'), f('isDefault', 'boolean')] });
    const stages = await seedTbl({ name: 'Lead Stages', internalName: 'leadStages', category: 'leads', fields: [f('name', 'string', true), f('pipelineId', 'string'), f('order', 'number'), f('type', 'string'), f('defaultWinProbability', 'number')] });
    const units = await seedTbl({ name: 'Units', internalName: 'units', category: 'business', fields: [f('name', 'string', true)] });

    await create(units.id, { name: 'Centro' });

    expect(await rowsOf(pipelines.id)).toHaveLength(1);
    expect(await rowsOf(stages.id)).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------------------------
describe('Inventory auto-provisioning (ProductAutoStock / UnitAutoStock)', () => {
  const unitFields = [f('name', 'string', true)];
  const productFields = [f('name', 'string', true)];
  const productUnitFields = [f('productId', 'string'), f('unitId', 'string'), f('stock', 'number'), f('reserved', 'number')];

  it('ProductAutoStock: creating a product seeds a stock row per existing unit', async () => {
    // units category 'operations' so LeadsSeedOnUnit (needs 'business') does not fire.
    const units = await seedTbl({ name: 'Units', internalName: 'units', category: 'operations', fields: unitFields });
    const products = await seedTbl({ name: 'Products', internalName: 'products', category: 'products', fields: productFields });
    const productUnits = await seedTbl({ name: 'Product Units', internalName: 'productUnits', category: 'inventory', fields: productUnitFields });
    await create(units.id, { name: 'U1' });
    await create(units.id, { name: 'U2' });

    await create(products.id, { name: 'P1' });

    expect(await rowsOf(productUnits.id)).toHaveLength(2);
  });

  it('UnitAutoStock: creating a unit seeds a stock row per existing product', async () => {
    // Create products BEFORE any unit so ProductAutoStock provisions nothing yet.
    const products = await seedTbl({ name: 'Products', internalName: 'products', category: 'products', fields: productFields });
    const productUnits = await seedTbl({ name: 'Product Units', internalName: 'productUnits', category: 'inventory', fields: productUnitFields });
    const units = await seedTbl({ name: 'Units', internalName: 'units', category: 'operations', fields: unitFields });
    await create(products.id, { name: 'P1' });
    await create(products.id, { name: 'P2' });
    expect(await rowsOf(productUnits.id)).toHaveLength(0);

    await create(units.id, { name: 'U1' });

    expect(await rowsOf(productUnits.id)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------------------------
describe('StockMovementsApplyPlugin — applies manual In/Out to stock', () => {
  const productUnitFields = [f('productId', 'string'), f('unitId', 'string'), f('stock', 'number'), f('reserved', 'number')];
  const movementFields = [
    f('productId', 'string'), f('unitId', 'string'),
    f('type', 'select', false, { options: ['In', 'Out'] }), f('quantity', 'number'),
    f('sourceType', 'string'), f('reason', 'string'),
  ];

  async function seedInventory(stock: number) {
    const productUnits = await seedTbl({ name: 'Product Units', internalName: 'productUnits', category: 'inventory', fields: productUnitFields });
    const movements = await seedTbl({ name: 'Stock Movements', internalName: 'stockMovements', category: 'inventory', fields: movementFields });
    const pu = await prisma.dynamicTableData.create({ data: { dynamicTableId: productUnits.id, data: { productId: 'p1', unitId: 'u1', stock, reserved: 0 } as any } });
    return { movements, puId: pu.id };
  }

  it('decrements stock on an Out movement', async () => {
    const { movements, puId } = await seedInventory(10);
    await create(movements.id, { productId: 'p1', unitId: 'u1', type: 'Out', quantity: 3 });
    expect((await rowById(puId))!.data as any).toMatchObject({ stock: 7 });
  });
  it('increments stock on an In movement', async () => {
    const { movements, puId } = await seedInventory(10);
    await create(movements.id, { productId: 'p1', unitId: 'u1', type: 'In', quantity: 5 });
    expect((await rowById(puId))!.data as any).toMatchObject({ stock: 15 });
  });
  it('rejects an Out movement that would drive stock negative', async () => {
    const { movements } = await seedInventory(10);
    await expect(create(movements.id, { productId: 'p1', unitId: 'u1', type: 'Out', quantity: 999 })).rejects.toBeInstanceOf(ValidationError);
  });
});

// ---------------------------------------------------------------------------------------------
describe('SalesPlugin — header guards + sale-item rules (no inventory wiring)', () => {
  const saleFields = [
    f('unitId', 'string'),
    f('status', 'select', false, { options: ['Draft', 'Finalized', 'Cancelled', 'Returned'] }),
    f('paymentStatus', 'select', false, { options: ['Pending', 'Paid'] }),
    f('date', 'string'),
    f('customerId', 'string'), f('simpleCustomer', 'boolean'), f('simpleCustomerName', 'string'),
    f('discountAmount', 'number'), f('subtotal', 'number'), f('totalAmount', 'number'),
  ];
  const itemFields = [
    f('saleId', 'string'), f('productId', 'string'), f('serviceId', 'string'),
    f('quantity', 'number'), f('unitPrice', 'number'),
    f('type', 'select', false, { options: ['Product', 'Service'] }),
  ];

  async function seedSales() {
    // Production category for sales is 'finance' (the 'sales' category was retired; see TableCategories).
    // SalesPlugin.supports matches ['sales','finance'] by category + internalName 'sales'/'saleItems'.
    const sales = await seedTbl({ name: 'Sales', internalName: 'sales', category: 'finance', fields: saleFields });
    const items = await seedTbl({ name: 'Sale Items', internalName: 'saleItems', category: 'finance', fields: itemFields });
    return { sales, items };
  }

  it('requires a unit to create a sale', async () => {
    const { sales } = await seedSales();
    await expect(create(sales.id, {})).rejects.toBeInstanceOf(ValidationError);
  });
  it('auto-fills the sale date on create', async () => {
    const { sales } = await seedSales();
    const sale = await create(sales.id, { unitId: 'u1' });
    expect((sale.data as any).date).toBeTruthy();
  });
  it('enforces the item XOR (exactly one of productId / serviceId)', async () => {
    const { sales, items } = await seedSales();
    const sale = await create(sales.id, { unitId: 'u1' });
    await expect(create(items.id, { saleId: sale.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(create(items.id, { saleId: sale.id, productId: 'p1', serviceId: 's1', quantity: 1 })).rejects.toBeInstanceOf(ValidationError);
  });
  it('forbids mixing product and service items in the same sale', async () => {
    const { sales, items } = await seedSales();
    const sale = await create(sales.id, { unitId: 'u1' });
    await create(items.id, { saleId: sale.id, productId: 'p1', quantity: 1, type: 'Product' });
    await expect(create(items.id, { saleId: sale.id, serviceId: 's1', type: 'Service' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('forbids adding items to a finalized sale', async () => {
    const { sales, items } = await seedSales();
    const finalized = await prisma.dynamicTableData.create({ data: { dynamicTableId: sales.id, data: { unitId: 'u1', status: 'Finalized' } as any } });
    await expect(create(items.id, { saleId: finalized.id, productId: 'p1', quantity: 1, type: 'Product' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('forbids finalizing a sale with no items', async () => {
    const { sales } = await seedSales();
    const sale = await create(sales.id, { unitId: 'u1' });
    await expect(update(sale.id, { status: 'Finalized' })).rejects.toBeInstanceOf(ValidationError);
  });
});
