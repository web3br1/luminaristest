// Mock the post-commit accounting bridge so the service test stays at the orchestration layer
// (the bridge has its own suite). We assert the service fires it AFTER the isSystem write.
const maybeReverseSalonSale = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('../../../accounting/sync/bridges/SalonSaleReversalBridge', () => ({
  __esModule: true,
  maybeReverseSalonSale: (...a: unknown[]) => maybeReverseSalonSale(...a),
}));
jest.mock('../../../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { SalesCancellationService } from '../SalesCancellationService';
import { NotFoundError, ValidationError } from '../../../../lib/errors';

const user = { userId: 'u1', role: 'USER' } as any;
const SALES_TABLE_ID = 'sales-table';

/** A finalized sale row owned by THIS tenant's sales table. */
function finalizedSaleRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    dynamicTableId: SALES_TABLE_ID,
    data: { status: 'Finalized', unitId: 'unit-1', totalAmount: 250, ...over },
  };
}

function buildService(over: { dts?: any; repo?: any } = {}) {
  const dynamicTableService = {
    updateTableData: jest.fn(async () => ({ id: 'sale-1', data: { status: 'Cancelled', unitId: 'unit-1' } })),
    ...over.dts,
  };
  const repository = {
    findTableByInternalName: jest.fn(async () => ({ id: SALES_TABLE_ID, userId: 'u1', category: 'finance' })),
    findDataById: jest.fn(async () => finalizedSaleRow()),
    ...over.repo,
  };
  const svc = new SalesCancellationService(dynamicTableService as any, repository as any);
  return { svc, dynamicTableService, repository };
}

const baseInput = { tableId: SALES_TABLE_ID, saleId: 'sale-1' };

describe('SalesCancellationService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('cancel', () => {
    it('flips Finalized → Cancelled via an isSystem write (the only legitimate immutableAfter bypass)', async () => {
      const { svc, dynamicTableService } = buildService();
      await svc.cancel(user, { ...baseInput, reason: 'customer gave up' });

      expect(dynamicTableService.updateTableData).toHaveBeenCalledTimes(1);
      const [u, id, dto, opts] = dynamicTableService.updateTableData.mock.calls[0];
      expect(u).toBe(user);
      expect(id).toBe('sale-1');
      expect(opts).toEqual({ isSystem: true });
      expect(dto.data).toEqual(
        expect.objectContaining({ status: 'Cancelled', actor: 'u1', reason: 'customer gave up' }),
      );
      expect(typeof dto.data.cancelledAt).toBe('string');
      expect(dto.data.returnedAt).toBeUndefined();
    });

    it('fires the post-commit bridge with the authoritative tableId AND the updated row', async () => {
      const updated = { id: 'sale-1', data: { status: 'Cancelled', unitId: 'unit-1' } };
      const { svc } = buildService({ dts: { updateTableData: jest.fn(async () => updated) } });
      await svc.cancel(user, baseInput);

      expect(maybeReverseSalonSale).toHaveBeenCalledTimes(1);
      expect(maybeReverseSalonSale).toHaveBeenCalledWith(user, SALES_TABLE_ID, updated);
    });
  });

  describe('return_', () => {
    it('flips Finalized → Returned via isSystem, stamping returnedAt (not cancelledAt)', async () => {
      const { svc, dynamicTableService } = buildService();
      await svc.return_(user, baseInput);

      const [, , dto, opts] = dynamicTableService.updateTableData.mock.calls[0];
      expect(opts).toEqual({ isSystem: true });
      expect(dto.data).toEqual(expect.objectContaining({ status: 'Returned', actor: 'u1' }));
      expect(typeof dto.data.returnedAt).toBe('string');
      expect(dto.data.cancelledAt).toBeUndefined();
    });
  });

  describe('guards', () => {
    it('rejects a non-Finalized sale (ValidationError) — no write, no bridge', async () => {
      const { svc, dynamicTableService } = buildService({
        repo: { findDataById: jest.fn(async () => finalizedSaleRow({ status: 'Draft' })) },
      });
      await expect(svc.cancel(user, baseInput)).rejects.toBeInstanceOf(ValidationError);
      expect(dynamicTableService.updateTableData).not.toHaveBeenCalled();
      expect(maybeReverseSalonSale).not.toHaveBeenCalled();
    });

    it('sales table not installed → NotFoundError', async () => {
      const { svc } = buildService({ repo: { findTableByInternalName: jest.fn(async () => null) } });
      await expect(svc.cancel(user, baseInput)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('cross-tenant sale (dynamicTableId ≠ caller sales table) → NotFoundError, no write', async () => {
      const { svc, dynamicTableService } = buildService({
        repo: { findDataById: jest.fn(async () => finalizedSaleRow({})) },
      });
      // Force a mismatch by making findDataById return a foreign parent table id.
      (svc as any).repository.findDataById = jest.fn(async () => ({
        id: 'sale-1',
        dynamicTableId: 'someone-else-sales',
        data: { status: 'Finalized', unitId: 'unit-1' },
      }));
      await expect(svc.cancel(user, baseInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(dynamicTableService.updateTableData).not.toHaveBeenCalled();
    });

    it('client tableId mismatch (≠ resolved sales table) → NotFoundError', async () => {
      const { svc } = buildService();
      await expect(svc.cancel(user, { ...baseInput, tableId: 'wrong-table' })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('missing sale → NotFoundError', async () => {
      const { svc } = buildService({ repo: { findDataById: jest.fn(async () => null) } });
      await expect(svc.cancel(user, baseInput)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
