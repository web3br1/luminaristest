// Mock the table finder so createMovementsForItems can resolve a movements table
// without a real repository — it must STILL create nothing for a Package item.
jest.mock('../../../shared/tableFinder', () => ({
  __esModule: true,
  resolveTable: jest.fn(async () => ({
    id: 'mv-table',
    schema: { fields: [{ name: 'productId' }, { name: 'type' }, { name: 'quantity' }] },
  })),
}));

import type { RuleContext } from '../../../RuleTypes';
import { ValidationError } from '../../../../../../lib/errors';
import {
  validateSaleItemXor,
  validateNoMixedItemTypesOnInsert,
} from '../saleItems';
import { createMovementsForItems } from '../stockSync';

function ctxWith(over: Partial<{ rows: unknown[]; isSystem: boolean; createData: jest.Mock; saleId: string }> = {}) {
  const createData = over.createData ?? jest.fn(async () => ({ id: 'created' }));
  return {
    table: { id: 'saleItems-table' },
    schema: { fields: [] },
    userId: 'u1',
    isSystem: over.isSystem ?? false,
    after: { id: over.saleId ?? 'sale-1' },
    before: {},
    repository: {
      findRowsByFieldValue: jest.fn(async () => over.rows ?? []),
      createData,
      findDataById: jest.fn(async () => null),
    },
  } as unknown as RuleContext;
}

describe('P3 — Package sale item validation', () => {
  describe('validateSaleItemXor (three-way)', () => {
    it('accepts a Package item with packageId', async () => {
      await expect(
        validateSaleItemXor(ctxWith(), { type: 'Package', packageId: 'pkg-1' }),
      ).resolves.toBeUndefined();
    });

    it('rejects a Package item WITHOUT packageId (Package exige packageId)', async () => {
      await expect(
        validateSaleItemXor(ctxWith(), { type: 'Package' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('still accepts Product (with qty) and Service items', async () => {
      await expect(
        validateSaleItemXor(ctxWith(), { type: 'Product', productId: 'p-1', quantity: 2 }),
      ).resolves.toBeUndefined();
      await expect(
        validateSaleItemXor(ctxWith(), { type: 'Service', serviceId: 's-1' }),
      ).resolves.toBeUndefined();
    });

    it('rejects more than one id (no productId+packageId on the same item)', async () => {
      await expect(
        validateSaleItemXor(ctxWith(), { type: 'Package', packageId: 'pkg-1', productId: 'p-1' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects a Product item with qty 0', async () => {
      await expect(
        validateSaleItemXor(ctxWith(), { type: 'Product', productId: 'p-1', quantity: 0 }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('validateNoMixedItemTypesOnInsert (Package included)', () => {
    it('blocks mixing an existing Service with a new Package item', async () => {
      const ctx = ctxWith({ rows: [{ data: { type: 'Service', serviceId: 's-1', saleId: 'sale-1' } }] });
      await expect(
        validateNoMixedItemTypesOnInsert(ctx, { type: 'Package', packageId: 'pkg-1', saleId: 'sale-1' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('blocks mixing an existing Product with a new Package item', async () => {
      const ctx = ctxWith({ rows: [{ data: { type: 'Product', productId: 'p-1', saleId: 'sale-1' } }] });
      await expect(
        validateNoMixedItemTypesOnInsert(ctx, { type: 'Package', packageId: 'pkg-1', saleId: 'sale-1' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('allows two package lines with the SAME packageId', async () => {
      const ctx = ctxWith({ rows: [{ data: { type: 'Package', packageId: 'pkg-1', saleId: 'sale-1' } }] });
      await expect(
        validateNoMixedItemTypesOnInsert(ctx, { type: 'Package', packageId: 'pkg-1', saleId: 'sale-1' }),
      ).resolves.toBeUndefined();
    });

    it('blocks two DISTINCT packageIds in the same sale (MVP: one package per sale)', async () => {
      const ctx = ctxWith({ rows: [{ data: { type: 'Package', packageId: 'pkg-1', saleId: 'sale-1' } }] });
      await expect(
        validateNoMixedItemTypesOnInsert(ctx, { type: 'Package', packageId: 'pkg-2', saleId: 'sale-1' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('stockSync ignores Package (no stockMovement)', () => {
    it('creates NO movement for a Package item', async () => {
      const createData = jest.fn(async () => ({ id: 'mv' }));
      const ctx = ctxWith({ createData });
      await createMovementsForItems(
        ctx,
        [{ id: 'it-1', data: { type: 'Package', packageId: 'pkg-1', quantity: 1 } }],
        'unit-1',
        'Out',
      );
      expect(createData).not.toHaveBeenCalled();
    });
  });
});
